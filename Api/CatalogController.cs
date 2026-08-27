using System;
using System.Collections.Generic;
using System.Linq;
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
    private readonly ICatalogStore _store;
    private readonly ILibraryManager _libraryManager;
    private readonly IDtoService _dtoService;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="CatalogController"/>.
    /// </summary>
    /// <param name="store">Stockage des catalogues.</param>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="dtoService">Service de conversion en DTO.</param>
    public CatalogController(ICatalogStore store, ILibraryManager libraryManager, IDtoService dtoService)
    {
        _store = store;
        _libraryManager = libraryManager;
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

        var entries = new List<CatalogEntryDto>(Math.Min(take, snapshot.Entries.Count));
        var items = new List<BaseItem>();
        var targets = new List<CatalogEntryDto>();

        foreach (var entry in snapshot.Entries)
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
                ItemCount = entry.ItemCount
            };

            entries.Add(dto);
            items.Add(item);
            targets.Add(dto);
        }

        if (items.Count > 0)
        {
            var dtos = _dtoService.GetBaseItemDtos(items, CreateDtoOptions());
            for (var i = 0; i < dtos.Count && i < targets.Count; i++)
            {
                targets[i].Item = dtos[i];
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
