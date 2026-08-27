using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Configuration;
using MediaBrowser.Common.Net;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Providers;

/// <summary>
/// Source de tendances basée sur l'API Trakt (endpoints <c>/movies/trending</c> et <c>/shows/trending</c>).
/// Trakt classe par nombre de spectateurs en cours, et fournit directement les identifiants TMDB et IMDb,
/// ce qui rend le rapprochement avec la bibliothèque locale plus fiable.
/// </summary>
public sealed class TraktTrendingProvider : ITrendingProvider
{
    private const string BaseUrl = "https://api.trakt.tv/";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TraktTrendingProvider> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TraktTrendingProvider"/>.
    /// </summary>
    /// <param name="httpClientFactory">Fabrique de clients HTTP de Jellyfin.</param>
    /// <param name="logger">Journal.</param>
    public TraktTrendingProvider(IHttpClientFactory httpClientFactory, ILogger<TraktTrendingProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public TrendingProviderKind Kind => TrendingProviderKind.Trakt;

    /// <inheritdoc />
    public async Task<IReadOnlyList<TrendingTitle>> GetTrendingAsync(TrendingRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.ApiKey))
        {
            throw new InvalidOperationException("Aucun identifiant client Trakt n'est configuré.");
        }

        var results = new List<TrendingTitle>();

        if (request.MediaKind is TopListMediaKind.Movies or TopListMediaKind.Both)
        {
            results.AddRange(await FetchAsync("movies", "movie", request, cancellationToken).ConfigureAwait(false));
        }

        if (request.MediaKind is TopListMediaKind.Series or TopListMediaKind.Both)
        {
            results.AddRange(await FetchAsync("shows", "show", request, cancellationToken).ConfigureAwait(false));
        }

        return results
            .OrderByDescending(t => t.Popularity)
            .Take(request.Limit)
            .Select((t, index) => t with { Rank = index + 1 })
            .ToArray();
    }

    private async Task<IReadOnlyList<TrendingTitle>> FetchAsync(
        string segment,
        string itemProperty,
        TrendingRequest request,
        CancellationToken cancellationToken)
    {
        var isMovie = string.Equals(itemProperty, "movie", StringComparison.Ordinal);
        var limit = Math.Clamp(request.Limit, 1, 100).ToString(CultureInfo.InvariantCulture);
        var url = BaseUrl + segment + "/trending?limit=" + limit;

        using var message = new HttpRequestMessage(HttpMethod.Get, url);
        message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        message.Headers.TryAddWithoutValidation("trakt-api-version", "2");
        message.Headers.TryAddWithoutValidation("trakt-api-key", request.ApiKey);

        var httpClient = _httpClientFactory.CreateClient(NamedClient.Default);
        using var response = await httpClient.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        if (document.RootElement.ValueKind != JsonValueKind.Array)
        {
            _logger.LogWarning("Réponse Trakt inattendue pour {Segment} : tableau attendu.", segment);
            return Array.Empty<TrendingTitle>();
        }

        var titles = new List<TrendingTitle>();
        var rank = 0;

        foreach (var element in document.RootElement.EnumerateArray())
        {
            if (!element.TryGetProperty(itemProperty, out var item) || item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var title = ReadString(item, "title");
            if (string.IsNullOrWhiteSpace(title))
            {
                continue;
            }

            var watchers = element.TryGetProperty("watchers", out var watchersElement)
                           && watchersElement.ValueKind == JsonValueKind.Number
                ? watchersElement.GetDouble()
                : 0d;

            string? tmdbId = null;
            string? imdbId = null;
            if (item.TryGetProperty("ids", out var ids) && ids.ValueKind == JsonValueKind.Object)
            {
                tmdbId = ids.TryGetProperty("tmdb", out var tmdb) && tmdb.ValueKind == JsonValueKind.Number
                    ? tmdb.GetInt32().ToString(CultureInfo.InvariantCulture)
                    : null;
                imdbId = ReadString(ids, "imdb");
            }

            var year = item.TryGetProperty("year", out var yearElement) && yearElement.ValueKind == JsonValueKind.Number
                ? yearElement.GetInt32()
                : (int?)null;

            // L'API Trakt ne renvoie pas d'affiche : la carte s'appuiera sur la bibliothèque locale.
            titles.Add(new TrendingTitle(++rank, title, year, tmdbId, imdbId, isMovie, watchers, PosterUrl: null));
        }

        return titles;
    }

    private static string? ReadString(JsonElement element, string propertyName)
        => element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
