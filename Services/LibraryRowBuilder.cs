using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Enums;
using JellyfinCarouselPlugin.Configuration;
using JellyfinCarouselPlugin.Models;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Construit les rangées dérivées de la seule bibliothèque : les films jamais lancés
/// et les séries dont des épisodes viennent d'arriver.
/// </summary>
public sealed class LibraryRowBuilder
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly ILogger<LibraryRowBuilder> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="LibraryRowBuilder"/>.
    /// </summary>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="userManager">Gestionnaire d'utilisateurs.</param>
    /// <param name="logger">Journal.</param>
    public LibraryRowBuilder(
        ILibraryManager libraryManager,
        IUserManager userManager,
        ILogger<LibraryRowBuilder> logger)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _logger = logger;
    }

    /// <summary>
    /// Construit la liste des films bien notés que personne n'a encore lancés.
    /// </summary>
    /// <remarks>
    /// Volontairement limité aux films : pour une série, « jamais vu » est ambigu — Jellyfin
    /// ne la considère lue que si tous ses épisodes le sont, si bien qu'une série entamée
    /// puis abandonnée remonterait comme jamais vue.
    /// </remarks>
    /// <param name="config">Configuration courante du plugin.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Un instantané classé par note décroissante.</returns>
    public TopListSnapshot BuildNeverPlayed(PluginConfiguration config, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(config);

        var size = Math.Clamp(config.NeverPlayedRowSize, 1, 100);
        var excludedUsers = ParseGuids(config.ExcludedUserIds);
        var excludedLibraries = ParseGuids(config.ExcludedLibraryIds);

        // Un film est « déjà vu » dès qu'un seul compte l'a lu : l'union des identifiants
        // suffit, et GetItemIds ne remonte que des identifiants, jamais les éléments entiers.
        var played = new HashSet<Guid>();

        foreach (var user in _userManager.GetUsers())
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (excludedUsers.Contains(user.Id) || user.HasPermission(PermissionKind.IsDisabled))
            {
                continue;
            }

            foreach (var id in _libraryManager.GetItemIds(new InternalItemsQuery(user)
            {
                IncludeItemTypes = new[] { BaseItemKind.Movie },
                IsPlayed = true,
                Recursive = true,
                EnableTotalRecordCount = false
            }))
            {
                played.Add(id);
            }
        }

        // Sur-échantillonnage : la plupart des mieux notés ont déjà été vus.
        var candidates = _libraryManager.GetItemList(new InternalItemsQuery
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie },
            IsFolder = false,
            Recursive = true,
            MinCommunityRating = config.NeverPlayedMinRating,
            OrderBy = new[] { (ItemSortBy.CommunityRating, SortOrder.Descending) },
            Limit = Math.Min(size * 20, 500),
            EnableTotalRecordCount = false,
            DtoOptions = new DtoOptions(false)
            {
                Fields = new[] { ItemFields.ProviderIds },
                EnableImages = false,
                EnableUserData = false
            }
        });

        var entries = candidates
            .Where(item => !played.Contains(item.Id) && !IsExcluded(item, excludedLibraries))
            .Take(size)
            .Select((item, index) => ToEntry(item, index + 1, item.CommunityRating ?? 0))
            .ToArray();

        _logger.LogInformation(
            "Rangée « jamais vu » : {Count} film(s) retenu(s) sur {Candidates} candidat(s), {Played} déjà lu(s).",
            entries.Length,
            candidates.Count,
            played.Count);

        return new TopListSnapshot(TopListKind.NeverPlayed, "Jellyfin", entries);
    }

    /// <summary>
    /// Construit la liste des séries dont des épisodes ont été ajoutés récemment.
    /// </summary>
    /// <param name="config">Configuration courante du plugin.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Un instantané classé de l'ajout le plus récent au plus ancien.</returns>
    public TopListSnapshot BuildReturningSeries(PluginConfiguration config, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(config);

        cancellationToken.ThrowIfCancellationRequested();

        var size = Math.Clamp(config.ReturningRowSize, 1, 100);
        var days = Math.Clamp(config.ReturningRowDays, 1, 365);
        var excludedLibraries = ParseGuids(config.ExcludedLibraryIds);

        var episodes = _libraryManager.GetItemList(new InternalItemsQuery
        {
            IncludeItemTypes = new[] { BaseItemKind.Episode },
            IsFolder = false,
            Recursive = true,
            MinDateCreated = DateTime.UtcNow.AddDays(-days),
            OrderBy = new[] { (ItemSortBy.DateCreated, SortOrder.Descending) },
            // Une série peut recevoir une saison entière d'un coup : il faut assez d'épisodes
            // pour que les séries suivantes apparaissent quand même.
            Limit = 1000,
            EnableTotalRecordCount = false,
            DtoOptions = new DtoOptions(false)
            {
                EnableImages = false,
                EnableUserData = false
            }
        });

        var seriesCache = new Dictionary<Guid, BaseItem?>();
        var seen = new HashSet<Guid>();
        var entries = new List<TopListEntry>(size);

        // Les épisodes arrivent du plus récent au plus ancien : la première occurrence
        // d'une série donne donc son rang.
        foreach (var episode in episodes)
        {
            if (entries.Count == size)
            {
                break;
            }

            if (episode is not Episode typed || typed.SeriesId == Guid.Empty || !seen.Add(typed.SeriesId))
            {
                continue;
            }

            if (!seriesCache.TryGetValue(typed.SeriesId, out var series))
            {
                series = _libraryManager.GetItemById(typed.SeriesId);
                seriesCache[typed.SeriesId] = series;
            }

            if (series is null || IsExcluded(series, excludedLibraries))
            {
                continue;
            }

            entries.Add(ToEntry(series, entries.Count + 1, 0));
        }

        _logger.LogInformation(
            "Rangée « de retour » : {Count} série(s) sur {Episodes} épisode(s) ajouté(s) depuis {Days} jour(s).",
            entries.Count,
            episodes.Count,
            days);

        return new TopListSnapshot(TopListKind.ReturningSeries, "Jellyfin", entries);
    }

    private static TopListEntry ToEntry(BaseItem item, int rank, double score) => new()
    {
        Rank = rank,
        ItemId = item.Id,
        Name = item.Name ?? string.Empty,
        ProductionYear = item.ProductionYear,
        Score = score,
        TmdbId = item.GetProviderId(MetadataProvider.Tmdb),
        ImdbId = item.GetProviderId(MetadataProvider.Imdb)
    };

    private static bool IsExcluded(BaseItem item, IReadOnlyCollection<Guid> excludedLibraries)
    {
        if (excludedLibraries.Count == 0)
        {
            return false;
        }

        var topParent = item.GetTopParent();
        return topParent is not null && excludedLibraries.Contains(topParent.Id);
    }

    private static HashSet<Guid> ParseGuids(string[]? values)
    {
        var result = new HashSet<Guid>();

        if (values is null)
        {
            return result;
        }

        foreach (var value in values)
        {
            if (Guid.TryParse(value, CultureInfo.InvariantCulture, out var guid))
            {
                result.Add(guid);
            }
        }

        return result;
    }
}
