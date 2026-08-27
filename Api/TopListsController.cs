using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.Services;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Expose les classements calculés par le plugin.
/// Aucun calcul n'a lieu ici : les points d'accès lisent l'instantané publié par la tâche planifiée.
/// </summary>
[ApiController]
[Authorize]
[Route("MediaCarousel")]
[Produces("application/json")]
public class TopListsController : ControllerBase
{
    /// <summary>Nom du claim portant l'identifiant de l'utilisateur authentifié.</summary>
    private const string UserIdClaim = "Jellyfin-UserId";

    private readonly ITopListStore _store;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IDtoService _dtoService;
    private readonly TopListRefreshService _refreshService;
    private readonly ILogger<TopListsController> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TopListsController"/>.
    /// </summary>
    /// <param name="store">Stockage des instantanés.</param>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="userManager">Gestionnaire d'utilisateurs.</param>
    /// <param name="dtoService">Service de conversion en DTO.</param>
    /// <param name="refreshService">Service de rafraîchissement.</param>
    /// <param name="logger">Journal.</param>
    public TopListsController(
        ITopListStore store,
        ILibraryManager libraryManager,
        IUserManager userManager,
        IDtoService dtoService,
        TopListRefreshService refreshService,
        ILogger<TopListsController> logger)
    {
        _store = store;
        _libraryManager = libraryManager;
        _userManager = userManager;
        _dtoService = dtoService;
        _refreshService = refreshService;
        _logger = logger;
    }

    /// <summary>
    /// Renvoie le classement des titres les plus lus sur le serveur.
    /// </summary>
    /// <param name="limit">Nombre maximal d'entrées renvoyées.</param>
    /// <param name="userId">Utilisateur pour lequel filtrer la visibilité. Par défaut, l'appelant.</param>
    /// <response code="200">Le classement local.</response>
    /// <returns>Le classement local.</returns>
    [HttpGet("Top/Local")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<TopListResponseDto> GetLocalTop([FromQuery] int? limit, [FromQuery] Guid? userId)
        => Ok(BuildResponse(TopListKind.Local, limit, userId));

    /// <summary>
    /// Renvoie le classement des titres les plus populaires selon la source externe configurée.
    /// </summary>
    /// <param name="limit">Nombre maximal d'entrées renvoyées.</param>
    /// <param name="userId">Utilisateur pour lequel filtrer la visibilité. Par défaut, l'appelant.</param>
    /// <response code="200">Le classement mondial.</response>
    /// <returns>Le classement mondial.</returns>
    [HttpGet("Top/Global")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<TopListResponseDto> GetGlobalTop([FromQuery] int? limit, [FromQuery] Guid? userId)
        => Ok(BuildResponse(TopListKind.Global, limit, userId));

    /// <summary>
    /// Renvoie les films bien notés que personne n'a encore lancés sur le serveur.
    /// </summary>
    /// <param name="limit">Nombre maximal d'entrées renvoyées.</param>
    /// <param name="userId">Utilisateur pour lequel filtrer la visibilité. Par défaut, l'appelant.</param>
    /// <response code="200">La rangée « jamais vu ».</response>
    /// <returns>La rangée « jamais vu ».</returns>
    [HttpGet("Rows/NeverPlayed")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<TopListResponseDto> GetNeverPlayed([FromQuery] int? limit, [FromQuery] Guid? userId)
        => Ok(BuildResponse(TopListKind.NeverPlayed, limit, userId));

    /// <summary>
    /// Renvoie les séries dont des épisodes viennent d'être ajoutés.
    /// </summary>
    /// <param name="limit">Nombre maximal d'entrées renvoyées.</param>
    /// <param name="userId">Utilisateur pour lequel filtrer la visibilité. Par défaut, l'appelant.</param>
    /// <response code="200">La rangée « de retour ».</response>
    /// <returns>La rangée « de retour ».</returns>
    [HttpGet("Rows/Returning")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<TopListResponseDto> GetReturningSeries([FromQuery] int? limit, [FromQuery] Guid? userId)
        => Ok(BuildResponse(TopListKind.ReturningSeries, limit, userId));

    /// <summary>
    /// Renvoie les réglages d'affichage nécessaires au script de la page d'accueil.
    /// </summary>
    /// <remarks>
    /// Point d'accès distinct de la configuration du plugin, qui exige des droits
    /// d'administrateur : un utilisateur standard doit pouvoir afficher les rangées
    /// sans jamais voir la clé d'API de la source externe.
    /// </remarks>
    /// <response code="200">Les réglages d'affichage.</response>
    /// <returns>Les réglages d'affichage.</returns>
    [HttpGet("ClientOptions")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<ClientOptionsDto> GetClientOptions()
    {
        var config = Plugin.Instance?.Configuration;

        if (config is null)
        {
            return Ok(new ClientOptionsDto());
        }

        return Ok(new ClientOptionsDto
        {
            EnableHomeRows = config.EnableHomeRows,
            ShowLocalRow = config.EnableLocalTop,
            ShowGlobalRow = config.EnableGlobalTop,
            LocalRowTitle = config.LocalRowTitle,
            GlobalRowTitle = config.GlobalRowTitle,
            HighlightColor = config.HighlightColor,
            LocalRowSize = config.LocalTopSize,
            GlobalRowSize = config.GlobalTopSize,
            ShowStudioRow = config.EnableStudioRow,
            StudioRowTitle = config.StudioRowTitle,
            StudioRowSize = config.StudioRowSize,
            ShowGenreRows = config.EnableGenreRows,
            GenreRowCount = config.GenreRowCount,
            GenreRowItemCount = config.GenreRowItemCount,
            ShowNeverPlayedRow = config.EnableNeverPlayedRow,
            NeverPlayedRowTitle = config.NeverPlayedRowTitle,
            NeverPlayedRowSize = config.NeverPlayedRowSize,
            ShowReturningRow = config.EnableReturningRow,
            ReturningRowTitle = config.ReturningRowTitle,
            ReturningRowSize = config.ReturningRowSize,
            HideNativeSections = config.HideNativeHomeSections
        });
    }

    /// <summary>
    /// Déclenche un recalcul immédiat des classements.
    /// </summary>
    /// <remarks>
    /// Le recalcul est lancé en arrière-plan : il peut durer plusieurs minutes sur une grande
    /// bibliothèque et ne doit pas maintenir la requête HTTP ouverte.
    /// </remarks>
    /// <response code="204">Le recalcul a été lancé.</response>
    /// <returns>Un statut sans contenu.</returns>
    [HttpPost("Top/Refresh")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public ActionResult RefreshTopLists()
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await _refreshService.RefreshAsync(null, CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Échec du rafraîchissement manuel des classements.");
            }
        });

        return NoContent();
    }

    private TopListResponseDto BuildResponse(TopListKind kind, int? limit, Guid? userId)
    {
        var snapshot = _store.Get(kind);
        var user = ResolveUser(userId);
        var take = Math.Clamp(limit ?? snapshot.Entries.Count, 0, 100);

        var items = new List<TopListItemDto>(Math.Min(take, snapshot.Entries.Count));
        var libraryItems = new List<BaseItem>();
        var libraryTargets = new List<TopListItemDto>();

        foreach (var entry in snapshot.Entries)
        {
            if (items.Count == take)
            {
                break;
            }

            BaseItem? item = null;
            if (entry.IsInLibrary)
            {
                item = _libraryManager.GetItemById(entry.ItemId);

                // L'élément a pu être supprimé, ou être invisible pour cet utilisateur
                // (contrôle parental, bibliothèque non autorisée) : on l'omet du classement.
                if (item is null || (user is not null && !item.IsVisible(user)))
                {
                    continue;
                }
            }

            var dto = new TopListItemDto
            {
                Rank = items.Count + 1,
                Score = entry.Score,
                Name = entry.Name,
                ProductionYear = entry.ProductionYear,
                TmdbId = entry.TmdbId,
                ImdbId = entry.ImdbId,
                PosterUrl = entry.PosterUrl,
                TotalPlays = entry.TotalPlays,
                DistinctViewers = entry.DistinctViewers,
                LastPlayedUtc = entry.LastPlayedUtc
            };

            items.Add(dto);

            if (item is not null)
            {
                libraryItems.Add(item);
                libraryTargets.Add(dto);
            }
        }

        // Une seule conversion groupée plutôt qu'un appel par élément.
        if (libraryItems.Count > 0)
        {
            var dtos = _dtoService.GetBaseItemDtos(libraryItems, CreateDtoOptions(), user);
            for (var i = 0; i < dtos.Count && i < libraryTargets.Count; i++)
            {
                libraryTargets[i].Item = dtos[i];
            }
        }

        return new TopListResponseDto
        {
            Kind = snapshot.Kind.ToString(),
            Source = snapshot.Source,
            GeneratedUtc = snapshot.GeneratedUtc,
            Items = items
        };
    }

    private Jellyfin.Database.Implementations.Entities.User? ResolveUser(Guid? userId)
    {
        if (userId.HasValue && userId.Value != Guid.Empty)
        {
            return _userManager.GetUserById(userId.Value);
        }

        var claim = User.Claims.FirstOrDefault(c => string.Equals(c.Type, UserIdClaim, StringComparison.OrdinalIgnoreCase))?.Value;

        // Une clé d'API n'est rattachée à aucun utilisateur : la visibilité n'est alors pas filtrée.
        return Guid.TryParse(claim, out var guid) && guid != Guid.Empty
            ? _userManager.GetUserById(guid)
            : null;
    }

    /// <summary>
    /// Le rendu n'a besoin que de l'identité de l'élément et de son affiche. Chaque champ
    /// supplémentaire est une jointure SQL de plus et des octets inutiles sur le réseau :
    /// le résumé seul pèse souvent plus que tout le reste de la réponse.
    /// </summary>
    private static DtoOptions CreateDtoOptions() => new(false)
    {
        Fields = Array.Empty<ItemFields>(),
        EnableImages = true,
        ImageTypeLimit = 1,
        ImageTypes = new[] { ImageType.Primary },
        EnableUserData = false
    };
}
