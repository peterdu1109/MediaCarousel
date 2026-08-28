using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Jellyfin.Data.Enums;
using JellyfinCarouselPlugin.Configuration;
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
/// <para>
/// L'agrégation est calculée une fois par la tâche planifiée, jamais à chaque requête.
/// </para>
/// <para>
/// Les décomptes ne viennent pas de Jellyfin : ceux que renvoient <c>GetStudios</c> et
/// <c>GetGenres</c> sont identiques pour toutes les entrées — voir <see cref="CatalogCounter"/>
/// pour la démonstration. Ces deux requêtes ne servent donc qu'à l'identité : l'identifiant
/// qui fait le lien et le logo qui décide de la variante affichée. Le comptage, lui, est
/// refait à partir des titres.
/// </para>
/// <para>
/// Le balayage se fait bibliothèque par bibliothèque. C'est ce qui permet à la fois
/// d'honorer <c>ExcludedLibraryIds</c>, qui n'était jusqu'ici appliqué qu'aux classements,
/// et de ventiler les décomptes pour que la lecture puisse filtrer selon les droits de
/// l'appelant.
/// </para>
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
    /// Agrège les studios et les genres en un seul balayage de la bibliothèque.
    /// </summary>
    /// <remarks>
    /// Les deux catalogues sont produits ensemble parce qu'ils se comptent sur les mêmes
    /// titres : les séparer doublerait le balayage sans rien apporter.
    /// </remarks>
    /// <param name="config">Configuration courante du plugin.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Les catalogues des studios et des genres.</returns>
    public (CatalogSnapshot Studios, CatalogSnapshot Genres) Build(
        PluginConfiguration config,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(config);
        cancellationToken.ThrowIfCancellationRequested();

        var excluded = ParseGuids(config.ExcludedLibraryIds);
        var studioCounter = new CatalogCounter(StudioNameNormalizer.Normalize, StringComparer.Ordinal);

        // Les genres se regroupent sur le nom lui-même, à la casse près : Jellyfin distingue
        // « Science-Fiction » de « science-fiction », ce sont deux entrées distinctes.
        var genreCounter = new CatalogCounter(name => name, StringComparer.OrdinalIgnoreCase);

        var scanned = 0;

        foreach (var library in GetLibraries())
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (excluded.Contains(library.Id))
            {
                continue;
            }

            foreach (var item in GetLibraryItems(library.Id))
            {
                foreach (var studio in item.Studios)
                {
                    studioCounter.Add(studio, library.Id);
                }

                foreach (var genre in item.Genres)
                {
                    genreCounter.Add(genre, library.Id);
                }

                scanned++;
            }
        }

        var studios = Project(
            CatalogKind.Studios,
            studioCounter,
            _libraryManager.GetStudios,
            StudioNameNormalizer.Normalize,
            StringComparer.Ordinal,
            enableImages: true,
            size: config.StudioRowSize,
            minimumItems: config.MinItemsPerStudio);

        var genres = Project(
            CatalogKind.Genres,
            genreCounter,
            _libraryManager.GetGenres,
            name => name,
            StringComparer.OrdinalIgnoreCase,
            enableImages: false,
            size: config.GenreRowCount,
            minimumItems: config.MinItemsPerGenre);

        _logger.LogInformation(
            "Catalogues agrégés sur {Scanned} titre(s) : {Studios} studio(s), {Genres} genre(s).",
            scanned,
            studios.Entries.Count,
            genres.Entries.Count);

        return (studios, genres);
    }

    /// <summary>
    /// Rapproche les décomptes calculés des identités renvoyées par Jellyfin, puis classe.
    /// </summary>
    private CatalogSnapshot Project(
        CatalogKind kind,
        CatalogCounter counter,
        Func<InternalItemsQuery, QueryResult<(BaseItem Item, ItemCounts ItemCounts)>> query,
        Func<string, string> keySelector,
        StringComparer keyComparer,
        bool enableImages,
        int size,
        int minimumItems)
    {
        var identities = QueryIdentities(kind, query, enableImages);
        if (identities is null)
        {
            return CatalogSnapshot.Empty(kind);
        }

        var clampedSize = Math.Clamp(size, 1, 100);
        var clampedMinimum = Math.Max(minimumItems, 1);

        // Une clé peut porter plusieurs libellés ; on retient celui qui possède un logo, puis
        // le mieux fourni. La rangée affiche des logos, un studio sans image y apparaîtrait
        // comme un simple libellé.
        var representatives = new Dictionary<string, CatalogRepresentative>(keyComparer);

        foreach (var (item, _) in identities.Items)
        {
            var name = item.Name;
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var key = keySelector(name.Trim());
            if (key.Length == 0 || !counter.Buckets.TryGetValue(key, out var bucket))
            {
                continue;
            }

            bucket.ByVariant.TryGetValue(name.Trim(), out var variantCount);
            var hasLogo = item.HasImage(ImageType.Logo, 0) || item.HasImage(ImageType.Thumb, 0);

            if (!representatives.TryGetValue(key, out var current) || current.IsBeatenBy(hasLogo, variantCount))
            {
                representatives[key] = new CatalogRepresentative(item.Id, name.Trim(), hasLogo, variantCount);
            }
        }

        var entries = representatives
            .Select(pair => new
            {
                Representative = pair.Value,
                Count = counter.Buckets[pair.Key]
            })
            .Where(x => x.Count.Total >= clampedMinimum)
            .OrderByDescending(x => x.Count.Total)
            .ThenBy(x => x.Representative.Name, StringComparer.CurrentCultureIgnoreCase)
            .Take(clampedSize)
            .Select(x => new CatalogEntry
            {
                ItemId = x.Representative.ItemId,
                Name = x.Representative.Name,
                ItemCount = x.Count.Total,
                CountsByLibrary = new Dictionary<Guid, int>(x.Count.ByLibrary)
            })
            .ToArray();

        return new CatalogSnapshot(kind, entries);
    }

    /// <summary>
    /// Énumère les bibliothèques de premier niveau du serveur.
    /// </summary>
    private IReadOnlyList<BaseItem> GetLibraries()
    {
        try
        {
            return _libraryManager.GetUserRootFolder().Children.ToArray();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Impossible d'énumérer les bibliothèques ; catalogues laissés en l'état.");
            return Array.Empty<BaseItem>();
        }
    }

    /// <summary>
    /// Renvoie les films et séries d'une bibliothèque.
    /// </summary>
    /// <remarks>
    /// <c>Studios</c> et <c>Genres</c> sont des colonnes de l'élément, pas des jointures :
    /// aucun <c>ItemFields</c> supplémentaire n'est nécessaire pour les lire.
    /// </remarks>
    private IReadOnlyList<BaseItem> GetLibraryItems(Guid libraryId)
    {
        try
        {
            return _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = CountedTypes,
                Recursive = true,
                AncestorIds = new[] { libraryId },
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
            _logger.LogError(ex, "Échec du balayage de la bibliothèque {LibraryId}.", libraryId);
            return Array.Empty<BaseItem>();
        }
    }

    private QueryResult<(BaseItem Item, ItemCounts ItemCounts)>? QueryIdentities(
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

    private static HashSet<Guid> ParseGuids(IEnumerable<string>? values)
    {
        var result = new HashSet<Guid>();
        if (values is null)
        {
            return result;
        }

        foreach (var value in values)
        {
            if (Guid.TryParse(value, out var parsed))
            {
                result.Add(parsed);
            }
        }

        return result;
    }
}
