using System;
using System.Collections.Generic;
using System.Linq;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.Services;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Expose les catalogues agrégés : studios et genres de la bibliothèque.
/// </summary>
/// <remarks>
/// Comme pour les classements, aucun calcul n'a lieu ici : les agrégations sont produites
/// par la tâche planifiée et simplement lues.
/// </remarks>
[ApiController]
[Authorize]
[Route("MediaCarousel")]
[Produces("application/json")]
public class CatalogController : ControllerBase
{
    private const string UserIdClaim = "Jellyfin-UserId";

    private readonly ICatalogStore _store;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IDtoService _dtoService;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="CatalogController"/>.
    /// </summary>
    /// <param name="store">Stockage des catalogues.</param>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="userManager">Gestionnaire d'utilisateurs.</param>
    /// <param name="dtoService">Service de conversion en DTO.</param>
    public CatalogController(
        ICatalogStore store,
        ILibraryManager libraryManager,
        IUserManager userManager,
        IDtoService dtoService)
    {
        _store = store;
        _libraryManager = libraryManager;
        _userManager = userManager;
        _dtoService = dtoService;
    }

    /// <summary>
    /// Renvoie les studios les mieux représentés dans la bibliothèque.
    /// </summary>
    /// <param name="limit">Nombre maximal d'entrées renvoyées.</param>
    /// <response code="200">Le catalogue des studios.</response>
    /// <returns>Le catalogue des studios.</returns>
    [HttpGet("Studios")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<CatalogResponseDto> GetStudios([FromQuery] int? limit)
        => Ok(BuildResponse(CatalogKind.Studios, limit));

    /// <summary>
    /// Renvoie les genres les mieux représentés dans la bibliothèque.
    /// </summary>
    /// <param name="limit">Nombre maximal d'entrées renvoyées.</param>
    /// <response code="200">Le catalogue des genres.</response>
    /// <returns>Le catalogue des genres.</returns>
    [HttpGet("Genres")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<CatalogResponseDto> GetGenres([FromQuery] int? limit)
        => Ok(BuildResponse(CatalogKind.Genres, limit));

    private CatalogResponseDto BuildResponse(CatalogKind kind, int? limit)
    {
        var snapshot = _store.Get(kind);
        var take = Math.Clamp(limit ?? snapshot.Entries.Count, 0, 100);
        var visibleLibraries = ResolveVisibleLibraries(ResolveUser());

        var entries = new List<CatalogEntryDto>(Math.Min(take, snapshot.Entries.Count));
        var items = new List<BaseItem>();
        var targets = new List<CatalogEntryDto>();

        // Le filtrage de visibilité change les décomptes, donc le classement : il faut
        // reclasser avant de tronquer, sans quoi la limite retiendrait les entrées d'après
        // un ordre calculé sur des titres que l'appelant n'a pas le droit de voir.
        var visible = new List<(CatalogEntry Entry, int Count)>(snapshot.Entries.Count);

        foreach (var entry in snapshot.Entries)
        {
            var count = CountVisible(entry, visibleLibraries);
            if (count > 0)
            {
                visible.Add((entry, count));
            }
        }

        foreach (var (entry, count) in visible.OrderByDescending(x => x.Count))
        {
            if (entries.Count == take)
            {
                break;
            }

            // Le studio ou le genre a pu être supprimé depuis la dernière agrégation.
            var item = _libraryManager.GetItemById(entry.ItemId);
            if (item is null)
            {
                continue;
            }

            var dto = new CatalogEntryDto
            {
                Id = entry.ItemId,
                Name = entry.Name,
                ItemCount = count
            };

            entries.Add(dto);
            items.Add(item);
            targets.Add(dto);
        }

        // `GetBaseItemDtos` FILTRE sur `IsVisible` et rend donc une liste potentiellement
        // plus courte que celle qu'on lui passe. Apparier sur la position ferait alors
        // glisser toutes les affiches d'un cran, sans que rien ne le signale et pour les
        // seuls comptes concernes. Aujourd'hui la boucle ci-dessus a deja ecarte les
        // elements invisibles, mais cette correspondance ne doit dependre de personne.
        if (items.Count > 0)
        {
            var dtos = _dtoService.GetBaseItemDtos(items, CreateDtoOptions());
            var byId = new Dictionary<Guid, BaseItemDto>(dtos.Count);

            foreach (var dto in dtos)
            {
                byId[dto.Id] = dto;
            }

            for (var i = 0; i < targets.Count; i++)
            {
                if (byId.TryGetValue(items[i].Id, out var match))
                {
                    targets[i].Item = match;
                }
            }
        }

        return new CatalogResponseDto
        {
            Kind = snapshot.Kind.ToString(),
            GeneratedUtc = snapshot.GeneratedUtc,
            Items = entries
        };
    }

    /// <summary>
    /// Additionne les titres d'une entrée dans les seules bibliothèques visibles.
    /// </summary>
    /// <remarks>
    /// Une entrée agrégée avant la mise à jour ne porte aucune ventilation : sa provenance
    /// est inconnue, pas vide. On la laisse alors passer avec son total d'origine plutôt que
    /// de vider les rangées entre le redémarrage et le premier recalcul.
    /// </remarks>
    private static int CountVisible(CatalogEntry entry, IReadOnlyCollection<Guid>? visibleLibraries)
    {
        if (entry.CountsByLibrary.Count == 0)
        {
            return entry.ItemCount;
        }

        // Pas d'utilisateur rattaché — une clé d'API, par exemple : rien à filtrer.
        if (visibleLibraries is null)
        {
            return entry.ItemCount;
        }

        var total = 0;
        foreach (var libraryId in visibleLibraries)
        {
            if (entry.CountsByLibrary.TryGetValue(libraryId, out var count))
            {
                total += count;
            }
        }

        return total;
    }

    /// <summary>
    /// Énumère les bibliothèques que cet utilisateur a le droit de voir.
    /// </summary>
    /// <param name="user">Utilisateur appelant, ou <see langword="null"/> pour une clé d'API.</param>
    /// <returns>Les identifiants des bibliothèques visibles, ou <see langword="null"/> si le filtrage ne s'applique pas.</returns>
    private IReadOnlyCollection<Guid>? ResolveVisibleLibraries(Jellyfin.Database.Implementations.Entities.User? user)
    {
        if (user is null)
        {
            return null;
        }

        try
        {
            return _libraryManager.GetUserRootFolder()
                .GetChildren(user, includeLinkedChildren: true)
                .Select(child => child.Id)
                .ToHashSet();
        }
        catch (Exception)
        {
            // Faute de pouvoir établir les droits, on ne publie rien plutôt que de publier trop.
            return Array.Empty<Guid>();
        }
    }

    private Jellyfin.Database.Implementations.Entities.User? ResolveUser()
    {
        var claim = User.Claims.FirstOrDefault(c => string.Equals(c.Type, UserIdClaim, StringComparison.OrdinalIgnoreCase))?.Value;

        // Une clé d'API n'est rattachée à aucun utilisateur : la visibilité n'est alors pas filtrée.
        return Guid.TryParse(claim, out var guid) && guid != Guid.Empty
            ? _userManager.GetUserById(guid)
            : null;
    }

    /// <summary>
    /// Les studios portent leur identité visuelle sur les images Logo et Thumb ;
    /// aucun autre champ n'est nécessaire au rendu d'une vignette.
    /// </summary>
    private static DtoOptions CreateDtoOptions() => new(false)
    {
        Fields = Array.Empty<ItemFields>(),
        EnableImages = true,
        ImageTypeLimit = 1,
        ImageTypes = new[] { ImageType.Logo, ImageType.Thumb },
        EnableUserData = false
    };
}
