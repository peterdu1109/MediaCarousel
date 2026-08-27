using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using Jellyfin.Data.Enums;
using JellyfinCarouselPlugin.Models;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
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
    /// Agrège les studios de la bibliothèque, en fusionnant les variantes d'un même nom.
    /// </summary>
    /// <remarks>
    /// Les fournisseurs de métadonnées écrivent le même studio sous plusieurs libellés :
    /// « Warner Bros. », « Warner Bros. Pictures », « Warner Bros. Animation » sont trois
    /// entrées distinctes dans Jellyfin, et la rangée affichait donc trois fois le même
    /// studio. Les variantes sont regroupées sur un nom normalisé ; la variante retenue est
    /// celle qui possède un logo, puis celle qui compte le plus de titres.
    /// </remarks>
    /// <param name="size">Nombre d'entrées conservées.</param>
    /// <param name="minimumItems">Nombre minimal de titres pour qu'un studio soit retenu.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Le catalogue des studios.</returns>
    public CatalogSnapshot BuildStudios(int size, int minimumItems, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var clampedSize = Math.Clamp(size, 1, 100);
        var clampedMinimum = Math.Max(minimumItems, 1);

        // Les images sont chargées ici, contrairement aux genres : elles servent à choisir
        // la variante à afficher.
        var result = Query(CatalogKind.Studios, _libraryManager.GetStudios, enableImages: true);

        if (result is null)
        {
            return CatalogSnapshot.Empty(CatalogKind.Studios);
        }

        var groups = new Dictionary<string, StudioGroup>(StringComparer.Ordinal);

        foreach (var (item, counts) in result.Items)
        {
            var name = item.Name;
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var key = StudioNameNormalizer.Normalize(name);
            if (key.Length == 0)
            {
                continue;
            }

            if (!groups.TryGetValue(key, out var group))
            {
                group = new StudioGroup();
                groups[key] = group;
            }

            group.Consider(item, counts.MovieCount + counts.SeriesCount);
        }

        var entries = groups.Values
            // Le classement s'appuie sur le total de toutes les variantes : un studio éclaté
            // en cinq libellés ne doit pas être relégué derrière un studio moins présent.
            .Where(group => group.TotalCount >= clampedMinimum)
            .OrderByDescending(group => group.TotalCount)
            .ThenBy(group => group.Name, StringComparer.CurrentCultureIgnoreCase)
            .Take(clampedSize)
            .Select(group => new CatalogEntry
            {
                ItemId = group.ItemId,
                Name = group.Name,
                ItemCount = group.TotalCount
            })
            .ToArray();

        _logger.LogInformation(
            "Catalogue Studios agrégé : {Count} entrée(s) retenue(s) sur {Raw} libellé(s), {Merged} variante(s) fusionnée(s).",
            entries.Length,
            result.Items.Count,
            result.Items.Count - groups.Count);

        return new CatalogSnapshot(CatalogKind.Studios, entries);
    }

    /// <summary>
    /// Agrège les genres de la bibliothèque.
    /// </summary>
    /// <param name="size">Nombre d'entrées conservées.</param>
    /// <param name="minimumItems">Nombre minimal de titres pour qu'un genre soit retenu.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Le catalogue des genres.</returns>
    public CatalogSnapshot BuildGenres(int size, int minimumItems, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var clampedSize = Math.Clamp(size, 1, 100);
        var clampedMinimum = Math.Max(minimumItems, 1);

        var result = Query(CatalogKind.Genres, _libraryManager.GetGenres, enableImages: false);

        if (result is null)
        {
            return CatalogSnapshot.Empty(CatalogKind.Genres);
        }

        // Un même genre peut exister sous plusieurs casses selon les sources.
        var groups = new Dictionary<string, CatalogEntry>(StringComparer.OrdinalIgnoreCase);

        foreach (var (item, counts) in result.Items)
        {
            var name = item.Name;
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var total = counts.MovieCount + counts.SeriesCount;

            if (groups.TryGetValue(name, out var existing))
            {
                if (total > existing.ItemCount)
                {
                    existing.ItemId = item.Id;
                    existing.Name = name;
                    existing.ItemCount = total;
                }

                continue;
            }

            groups[name] = new CatalogEntry { ItemId = item.Id, Name = name, ItemCount = total };
        }

        var entries = groups.Values
            .Where(entry => entry.ItemCount >= clampedMinimum)
            .OrderByDescending(entry => entry.ItemCount)
            .ThenBy(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase)
            .Take(clampedSize)
            .ToArray();

        _logger.LogInformation("Catalogue Genres agrégé : {Count} entrée(s) retenue(s).", entries.Length);
        return new CatalogSnapshot(CatalogKind.Genres, entries);
    }

    private QueryResult<(BaseItem Item, ItemCounts ItemCounts)>? Query(
        CatalogKind kind,
        Func<InternalItemsQuery, QueryResult<(BaseItem Item, ItemCounts ItemCounts)>> query,
        bool enableImages)
    {
        try
        {
            return query(new InternalItemsQuery
            {
                IncludeItemTypes = CountedTypes,
                Recursive = true,
                EnableTotalRecordCount = false,
                DtoOptions = new DtoOptions(false)
                {
                    EnableImages = enableImages,
                    EnableUserData = false
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Échec de l'agrégation du catalogue {Kind}.", kind);
            return null;
        }
    }

    /// <summary>
    /// Variantes d'un même studio, dont on ne gardera qu'un représentant.
    /// </summary>
    private sealed class StudioGroup
    {
        public Guid ItemId { get; private set; }

        public string Name { get; private set; } = string.Empty;

        public int TotalCount { get; private set; }

        private bool _hasLogo;

        private int _bestCount = -1;

        public void Consider(BaseItem item, int count)
        {
            TotalCount += count;

            var hasLogo = item.HasImage(ImageType.Logo, 0) || item.HasImage(ImageType.Thumb, 0);

            // Une variante illustrée l'emporte sur une variante mieux fournie : la rangée
            // affiche des logos, un studio sans image y apparaîtrait comme un simple libellé.
            var better = ItemId == Guid.Empty
                || (hasLogo && !_hasLogo)
                || (hasLogo == _hasLogo && count > _bestCount);

            if (!better)
            {
                return;
            }

            ItemId = item.Id;
            Name = item.Name ?? string.Empty;
            _hasLogo = hasLogo;
            _bestCount = count;
        }
    }
}
