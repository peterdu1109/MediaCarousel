using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
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
/// Calcule le classement des titres les plus lus sur le serveur, tous utilisateurs confondus.
/// </summary>
/// <remarks>
/// Jellyfin ne stocke aucun compteur de lecture global : <c>UserItemData.PlayCount</c> est propre à
/// chaque couple (utilisateur, élément), et le tri SQL <see cref="ItemSortBy.PlayCount"/> est traduit par le
/// serveur en un filtre sur <c>UserData.UserId == query.User.Id</c>. Un classement « serveur » ne peut donc
/// pas être obtenu par une requête unique : il faut interroger la base une fois par utilisateur, en laissant
/// le tri et la limite au moteur SQL, puis agréger les N meilleurs candidats en mémoire.
/// Le coût est de <c>nbUtilisateurs</c> requêtes bornées, et non d'un balayage de toute la bibliothèque.
/// </remarks>
public sealed class LocalTopListBuilder
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IUserDataManager _userDataManager;
    private readonly ILogger<LocalTopListBuilder> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="LocalTopListBuilder"/>.
    /// </summary>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="userManager">Gestionnaire d'utilisateurs.</param>
    /// <param name="userDataManager">Gestionnaire des données utilisateur.</param>
    /// <param name="logger">Journal.</param>
    public LocalTopListBuilder(
        ILibraryManager libraryManager,
        IUserManager userManager,
        IUserDataManager userDataManager,
        ILogger<LocalTopListBuilder> logger)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _userDataManager = userDataManager;
        _logger = logger;
    }

    /// <summary>
    /// Construit le classement local.
    /// </summary>
    /// <param name="config">Configuration courante du plugin.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Un instantané classé par rang croissant.</returns>
    public TopListSnapshot Build(PluginConfiguration config, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(config);

        var excludedUsers = ParseGuids(config.ExcludedUserIds);
        var excludedLibraries = ParseGuids(config.ExcludedLibraryIds);
        var cutoffUtc = config.LocalTopWindowDays > 0
            ? DateTime.UtcNow.AddDays(-config.LocalTopWindowDays)
            : (DateTime?)null;
        var playCap = config.MaxPlaysCountedPerUser > 0 ? config.MaxPlaysCountedPerUser : int.MaxValue;
        var candidates = Math.Clamp(config.CandidatesPerUser, 10, 1000);
        var itemTypes = ResolveItemTypes(config.LocalTopMediaKind);

        if (itemTypes.Length == 0)
        {
            return TopListSnapshot.Empty(TopListKind.Local);
        }

        // Agrégats par titre. Pour un épisode, le score est reporté sur sa série.
        var aggregates = new Dictionary<Guid, Aggregate>();
        var seriesCache = new Dictionary<Guid, BaseItem?>();
        var usersCounted = 0;

        foreach (var user in _userManager.GetUsers())
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (excludedUsers.Contains(user.Id) || user.HasPermission(PermissionKind.IsDisabled))
            {
                continue;
            }

            usersCounted++;
            AccumulateForUser(user, itemTypes, candidates, cutoffUtc, playCap, excludedLibraries, aggregates, seriesCache);
        }

        var entries = aggregates.Values
            .OrderByDescending(a => a.Score)
            .ThenByDescending(a => a.Viewers.Count)
            .ThenByDescending(a => a.LastPlayedUtc ?? DateTime.MinValue)
            .Take(Math.Clamp(config.LocalTopSize, 1, 100))
            .Select((a, index) => new TopListEntry
            {
                Rank = index + 1,
                ItemId = a.ItemId,
                Name = a.Name,
                ProductionYear = a.ProductionYear,
                Score = a.Score,
                TotalPlays = a.TotalPlays,
                DistinctViewers = a.Viewers.Count,
                LastPlayedUtc = a.LastPlayedUtc,
                TmdbId = a.TmdbId,
                ImdbId = a.ImdbId
            })
            .ToArray();

        _logger.LogInformation(
            "Top local recalculé : {Count} entrées à partir de {Users} utilisateur(s) et {Candidates} titre(s) distincts.",
            entries.Length,
            usersCounted,
            aggregates.Count);

        return new TopListSnapshot(TopListKind.Local, "Jellyfin", entries);
    }

    /// <summary>
    /// Extrait les meilleurs candidats d'un utilisateur et les verse dans les agrégats.
    /// </summary>
    private void AccumulateForUser(
        User user,
        BaseItemKind[] itemTypes,
        int candidates,
        DateTime? cutoffUtc,
        int playCap,
        IReadOnlyCollection<Guid> excludedLibraries,
        Dictionary<Guid, Aggregate> aggregates,
        Dictionary<Guid, BaseItem?> seriesCache)
    {
        // Le tri et la limite sont délégués à SQL ; seuls les meilleurs candidats remontent en mémoire.
        var query = new InternalItemsQuery(user)
        {
            IncludeItemTypes = itemTypes,
            IsPlayed = true,
            IsFolder = false,
            Recursive = true,
            Limit = candidates,
            EnableTotalRecordCount = false,
            OrderBy = new[] { (ItemSortBy.PlayCount, SortOrder.Descending) },
            DtoOptions = new DtoOptions(false)
            {
                Fields = new[] { ItemFields.ProviderIds },
                EnableImages = false,
                EnableUserData = true
            }
        };

        IReadOnlyList<BaseItem> items;
        try
        {
            items = _libraryManager.GetItemList(query);
        }
        catch (Exception ex)
        {
            // Un utilisateur en erreur ne doit pas invalider tout le classement.
            _logger.LogError(ex, "Échec de la lecture des statistiques de l'utilisateur {UserId}.", user.Id);
            return;
        }

        foreach (var item in items)
        {
            var userData = _userDataManager.GetUserData(user, item);
            if (userData is null || userData.PlayCount <= 0)
            {
                continue;
            }

            if (cutoffUtc.HasValue && (!userData.LastPlayedDate.HasValue || userData.LastPlayedDate.Value.ToUniversalTime() < cutoffUtc.Value))
            {
                continue;
            }

            // Un épisode compte pour sa série : c'est la série qui est classée, pas l'épisode isolé.
            var target = item is Episode episode && episode.SeriesId != Guid.Empty
                ? ResolveSeries(episode.SeriesId, seriesCache) ?? item
                : item;

            if (excludedLibraries.Count > 0)
            {
                var topParent = target.GetTopParent();
                if (topParent is not null && excludedLibraries.Contains(topParent.Id))
                {
                    continue;
                }
            }

            if (!aggregates.TryGetValue(target.Id, out var aggregate))
            {
                aggregate = new Aggregate
                {
                    ItemId = target.Id,
                    Name = target.Name ?? string.Empty,
                    ProductionYear = target.ProductionYear,
                    TmdbId = target.GetProviderId(MetadataProvider.Tmdb),
                    ImdbId = target.GetProviderId(MetadataProvider.Imdb)
                };
                aggregates[target.Id] = aggregate;
            }

            var counted = Math.Min(userData.PlayCount, playCap);
            aggregate.Score += counted;
            aggregate.TotalPlays += userData.PlayCount;

            aggregate.Viewers.Add(user.Id);

            var lastPlayed = userData.LastPlayedDate?.ToUniversalTime();
            if (lastPlayed.HasValue && (!aggregate.LastPlayedUtc.HasValue || lastPlayed.Value > aggregate.LastPlayedUtc.Value))
            {
                aggregate.LastPlayedUtc = lastPlayed;
            }
        }
    }

    /// <summary>
    /// Résout une série en mémorisant le résultat : plusieurs épisodes d'une même série
    /// partagent une seule lecture de la base.
    /// </summary>
    private BaseItem? ResolveSeries(Guid seriesId, Dictionary<Guid, BaseItem?> cache)
    {
        if (!cache.TryGetValue(seriesId, out var series))
        {
            series = _libraryManager.GetItemById(seriesId);
            cache[seriesId] = series;
        }

        return series;
    }

    private static BaseItemKind[] ResolveItemTypes(TopListMediaKind kind) => kind switch
    {
        // Les séries sont classées via leurs épisodes : c'est là que vivent les compteurs de lecture.
        TopListMediaKind.Movies => new[] { BaseItemKind.Movie },
        TopListMediaKind.Series => new[] { BaseItemKind.Episode },
        TopListMediaKind.Both => new[] { BaseItemKind.Movie, BaseItemKind.Episode },
        _ => Array.Empty<BaseItemKind>()
    };

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

    /// <summary>
    /// Accumulateur mutable interne, converti en <see cref="TopListEntry"/> immuable en fin de calcul.
    /// </summary>
    private sealed class Aggregate
    {
        public Guid ItemId { get; init; }

        public string Name { get; init; } = string.Empty;

        public int? ProductionYear { get; init; }

        public string? TmdbId { get; init; }

        public string? ImdbId { get; init; }

        public double Score { get; set; }

        public int TotalPlays { get; set; }

        public DateTime? LastPlayedUtc { get; set; }

        public HashSet<Guid> Viewers { get; } = new();
    }
}
