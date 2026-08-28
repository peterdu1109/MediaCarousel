using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Jellyfin.Data.Enums;
using JellyfinCarouselPlugin.Providers;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Index des identifiants externes de la bibliothèque, construit en une seule requête,
/// pour rapprocher les titres d'un classement externe des éléments locaux sans requête par titre.
/// </summary>
public sealed class LibraryTitleIndex
{
    private readonly Dictionary<string, Guid> _byTmdbMovie = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Guid> _byTmdbSeries = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Guid> _byImdb = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Guid> _byNameYear = new(StringComparer.Ordinal);

    private LibraryTitleIndex()
    {
    }

    /// <summary>
    /// Obtient le nombre d'éléments indexés.
    /// </summary>
    public int Count { get; private set; }

    /// <summary>
    /// Construit l'index à partir des films et séries de la bibliothèque.
    /// </summary>
    /// <remarks>
    /// Sans exclusion, une seule requête suffit. Avec des bibliothèques exclues, l'index est
    /// construit bibliothèque par bibliothèque — <c>InternalItemsQuery</c> sait restreindre à
    /// des ancêtres (<c>AncestorIds</c>) mais pas en exclure — et un titre externe ne peut
    /// alors plus être rapproché d'un élément d'une bibliothèque exclue : il apparaît comme
    /// absent, au lieu de mener vers ce que l'administrateur voulait retirer des rangées.
    /// </remarks>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="excludedLibraries">Bibliothèques à ne pas indexer.</param>
    /// <returns>L'index construit.</returns>
    public static LibraryTitleIndex Build(
        ILibraryManager libraryManager,
        IReadOnlyCollection<Guid>? excludedLibraries = null)
    {
        ArgumentNullException.ThrowIfNull(libraryManager);

        var index = new LibraryTitleIndex();

        if (excludedLibraries is null || excludedLibraries.Count == 0)
        {
            index.AddRange(Query(libraryManager, null));
            return index;
        }

        foreach (var library in libraryManager.GetUserRootFolder().Children)
        {
            if (!excludedLibraries.Contains(library.Id))
            {
                index.AddRange(Query(libraryManager, library.Id));
            }
        }

        return index;
    }

    /// <summary>
    /// Interroge les films et séries, de toute la bibliothèque ou d'une seule.
    /// </summary>
    private static IReadOnlyList<BaseItem> Query(ILibraryManager libraryManager, Guid? ancestorId)
    {
        // Sans images ni données utilisateur : seuls les ProviderIds sont chargés.
        return libraryManager.GetItemList(new InternalItemsQuery
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
            Recursive = true,
            EnableTotalRecordCount = false,
            AncestorIds = ancestorId.HasValue ? new[] { ancestorId.Value } : Array.Empty<Guid>(),
            DtoOptions = new DtoOptions(false)
            {
                Fields = new[] { ItemFields.ProviderIds },
                EnableImages = false,
                EnableUserData = false
            }
        });
    }

    private void AddRange(IReadOnlyList<BaseItem> items)
    {
        foreach (var item in items)
        {
            Add(item);
        }

        Count += items.Count;
    }

    /// <summary>
    /// Recherche l'élément local correspondant à un titre externe.
    /// L'identifiant TMDB prime, puis l'identifiant IMDb, puis le couple titre normalisé + année.
    /// </summary>
    /// <param name="title">Titre externe.</param>
    /// <param name="itemId">Identifiant local trouvé.</param>
    /// <returns><c>true</c> si un élément correspond.</returns>
    public bool TryResolve(TrendingTitle title, out Guid itemId)
    {
        ArgumentNullException.ThrowIfNull(title);

        var byType = title.IsMovie ? _byTmdbMovie : _byTmdbSeries;

        if (!string.IsNullOrEmpty(title.TmdbId) && byType.TryGetValue(title.TmdbId, out itemId))
        {
            return true;
        }

        if (!string.IsNullOrEmpty(title.ImdbId) && _byImdb.TryGetValue(title.ImdbId, out itemId))
        {
            return true;
        }

        if (title.Year.HasValue && _byNameYear.TryGetValue(BuildNameKey(title.Title, title.Year.Value, title.IsMovie), out itemId))
        {
            return true;
        }

        itemId = Guid.Empty;
        return false;
    }

    private void Add(BaseItem item)
    {
        var isMovie = item is MediaBrowser.Controller.Entities.Movies.Movie;

        var tmdbId = item.GetProviderId(MetadataProvider.Tmdb);
        if (!string.IsNullOrEmpty(tmdbId))
        {
            // TMDB numérote films et séries indépendamment : deux index distincts sont nécessaires.
            var target = isMovie ? _byTmdbMovie : _byTmdbSeries;
            target.TryAdd(tmdbId, item.Id);
        }

        var imdbId = item.GetProviderId(MetadataProvider.Imdb);
        if (!string.IsNullOrEmpty(imdbId))
        {
            _byImdb.TryAdd(imdbId, item.Id);
        }

        if (item.ProductionYear.HasValue && !string.IsNullOrEmpty(item.Name))
        {
            _byNameYear.TryAdd(BuildNameKey(item.Name, item.ProductionYear.Value, isMovie), item.Id);
        }
    }

    /// <summary>
    /// Construit une clé titre + année insensible à la casse, aux accents et à la ponctuation.
    /// </summary>
    private static string BuildNameKey(string name, int year, bool isMovie)
    {
        var normalized = name.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length + 8);

        builder.Append(isMovie ? 'm' : 's').Append(':');

        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToLowerInvariant(character));
            }
        }

        return builder.Append(':').Append(year.ToString(CultureInfo.InvariantCulture)).ToString();
    }
}
