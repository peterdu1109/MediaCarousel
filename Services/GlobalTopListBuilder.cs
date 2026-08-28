using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Configuration;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.Providers;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Construit le classement mondial à partir d'une base de données externe,
/// puis le rapproche de la bibliothèque locale.
/// </summary>
public sealed class GlobalTopListBuilder
{
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(3);

    private readonly IReadOnlyList<ITrendingProvider> _providers;
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<GlobalTopListBuilder> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="GlobalTopListBuilder"/>.
    /// </summary>
    /// <param name="providers">Sources de tendances enregistrées.</param>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="logger">Journal.</param>
    public GlobalTopListBuilder(
        IEnumerable<ITrendingProvider> providers,
        ILibraryManager libraryManager,
        ILogger<GlobalTopListBuilder> logger)
    {
        _providers = providers.ToArray();
        _libraryManager = libraryManager;
        _logger = logger;
    }

    /// <summary>
    /// Construit le classement global.
    /// </summary>
    /// <param name="config">Configuration courante du plugin.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Un instantané classé par rang croissant.</returns>
    public async Task<TopListSnapshot> BuildAsync(PluginConfiguration config, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(config);

        var provider = _providers.FirstOrDefault(p => p.Kind == config.GlobalTopProvider)
            ?? throw new InvalidOperationException($"Aucune source de tendances enregistrée pour {config.GlobalTopProvider}.");

        var size = Math.Clamp(config.GlobalTopSize, 1, 100);

        // Sur-échantillonnage : après filtrage sur la bibliothèque, il faut assez de candidats
        // pour remplir les {size} places.
        var fetchLimit = config.GlobalTopLibraryOnly ? Math.Min(size * 5, 100) : size;

        var request = new TrendingRequest(
            config.GlobalTopMediaKind,
            fetchLimit,
            string.IsNullOrWhiteSpace(config.MetadataLanguage) ? "en-US" : config.MetadataLanguage,
            config.GlobalTopApiKey);

        var titles = await FetchWithRetryAsync(provider, request, cancellationToken).ConfigureAwait(false);

        if (titles.Count == 0)
        {
            _logger.LogWarning("{Provider} n'a renvoyé aucun titre.", provider.Kind);
            return new TopListSnapshot(TopListKind.Global, provider.Kind.ToString(), Array.Empty<TopListEntry>());
        }

        // Les bibliothèques exclues ne sont pas indexées : leurs titres apparaissent comme
        // absents du serveur au lieu d'être rapprochés puis affichés.
        var excludedLibraries = new HashSet<Guid>();
        foreach (var value in config.ExcludedLibraryIds)
        {
            if (Guid.TryParse(value, out var parsed))
            {
                excludedLibraries.Add(parsed);
            }
        }

        var index = LibraryTitleIndex.Build(_libraryManager, excludedLibraries);
        var entries = new List<TopListEntry>(size);

        foreach (var title in titles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var matched = index.TryResolve(title, out var itemId);
            if (!matched && config.GlobalTopLibraryOnly)
            {
                continue;
            }

            entries.Add(new TopListEntry
            {
                Rank = entries.Count + 1,
                ItemId = matched ? itemId : Guid.Empty,
                Name = title.Title,
                ProductionYear = title.Year,
                Score = title.Popularity,
                TmdbId = title.TmdbId,
                ImdbId = title.ImdbId,
                PosterUrl = title.PosterUrl
            });

            if (entries.Count == size)
            {
                break;
            }
        }

        _logger.LogInformation(
            "Top global recalculé via {Provider} : {Count} entrée(s) sur {Fetched} titre(s) reçus ({Indexed} éléments indexés).",
            provider.Kind,
            entries.Count,
            titles.Count,
            index.Count);

        return new TopListSnapshot(TopListKind.Global, provider.Kind.ToString(), entries);
    }

    /// <summary>
    /// Interroge la source avec un délai maximal et une unique nouvelle tentative sur erreur transitoire.
    /// </summary>
    private async Task<IReadOnlyList<TrendingTitle>> FetchWithRetryAsync(
        ITrendingProvider provider,
        TrendingRequest request,
        CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(RequestTimeout);

            try
            {
                return await provider.GetTrendingAsync(request, timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex) when (attempt == 1 && ex is HttpRequestException or OperationCanceledException)
            {
                _logger.LogWarning(ex, "Échec de l'appel à {Provider}, nouvelle tentative dans {Delay}.", provider.Kind, RetryDelay);
                await Task.Delay(RetryDelay, cancellationToken).ConfigureAwait(false);
            }
        }
    }
}
