using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Jellyfin.Data.Enums;
using JellyfinCarouselPlugin.Models;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Querying;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Agrège les studios et les genres de la bibliothèque, classés par nombre de titres.
/// </summary>
/// <remarks>
/// Ces agrégations groupent sur l'ensemble de la bibliothèque : elles sont donc calculées
/// une fois par la tâche planifiée, jamais à chaque requête. Elles sont volontairement
/// globales — elles ne portent aucune donnée de titre, seulement des noms de studios et de
/// genres avec un décompte. La visibilité réelle des titres reste appliquée par Jellyfin
/// lorsque l'utilisateur ouvre la page d'un studio ou d'un genre.
/// </remarks>
public sealed class CatalogBuilder
{
    private static readonly BaseItemKind[] CountedTypes = { BaseItemKind.Movie, BaseItemKind.Series };

    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<CatalogBuilder> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="CatalogBuilder"/>.
    /// </summary>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="logger">Journal.</param>
    public CatalogBuilder(ILibraryManager libraryManager, ILogger<CatalogBuilder> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
    }

    /// <summary>
    /// Agrège les studios de la bibliothèque.
    /// </summary>
    /// <param name="size">Nombre d'entrées conservées.</param>
    /// <param name="minimumItems">Nombre minimal de titres pour qu'un studio soit retenu.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Le catalogue des studios.</returns>
    public CatalogSnapshot BuildStudios(int size, int minimumItems, CancellationToken cancellationToken)
        => Build(CatalogKind.Studios, _libraryManager.GetStudios, size, minimumItems, cancellationToken);

    /// <summary>
    /// Agrège les genres de la bibliothèque.
    /// </summary>
    /// <param name="size">Nombre d'entrées conservées.</param>
    /// <param name="minimumItems">Nombre minimal de titres pour qu'un genre soit retenu.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Le catalogue des genres.</returns>
    public CatalogSnapshot BuildGenres(int size, int minimumItems, CancellationToken cancellationToken)
        => Build(CatalogKind.Genres, _libraryManager.GetGenres, size, minimumItems, cancellationToken);

    private CatalogSnapshot Build(
        CatalogKind kind,
        Func<InternalItemsQuery, QueryResult<(BaseItem Item, ItemCounts ItemCounts)>> query,
        int size,
        int minimumItems,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var clampedSize = Math.Clamp(size, 1, 100);
        var clampedMinimum = Math.Max(minimumItems, 1);

        QueryResult<(BaseItem Item, ItemCounts ItemCounts)> result;

        try
        {
            result = query(new InternalItemsQuery
            {
                IncludeItemTypes = CountedTypes,
                Recursive = true,
                EnableTotalRecordCount = false,
                DtoOptions = new DtoOptions(false)
                {
                    EnableImages = false,
                    EnableUserData = false
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Échec de l'agrégation du catalogue {Kind}.", kind);
            return CatalogSnapshot.Empty(kind);
        }

        var entries = result.Items
            .Select(pair => new CatalogEntry
            {
                ItemId = pair.Item.Id,
                Name = pair.Item.Name ?? string.Empty,
                ItemCount = pair.ItemCounts.MovieCount + pair.ItemCounts.SeriesCount
            })
            .Where(entry => entry.ItemCount >= clampedMinimum && !string.IsNullOrEmpty(entry.Name))
            .OrderByDescending(entry => entry.ItemCount)
            .ThenBy(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase)
            .Take(clampedSize)
            .ToArray();

        _logger.LogInformation("Catalogue {Kind} agrégé : {Count} entrée(s) retenue(s).", kind, entries.Length);
        return new CatalogSnapshot(kind, entries);
    }
}
