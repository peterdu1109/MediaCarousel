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
/// Source de tendances basée sur l'API TMDB (endpoint <c>/trending</c>, fenêtre hebdomadaire).
/// </summary>
public sealed class TmdbTrendingProvider : ITrendingProvider
{
    private const string BaseUrl = "https://api.themoviedb.org/3/trending/";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TmdbTrendingProvider> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TmdbTrendingProvider"/>.
    /// </summary>
    /// <param name="httpClientFactory">Fabrique de clients HTTP de Jellyfin.</param>
    /// <param name="logger">Journal.</param>
    public TmdbTrendingProvider(IHttpClientFactory httpClientFactory, ILogger<TmdbTrendingProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public TrendingProviderKind Kind => TrendingProviderKind.Tmdb;

    /// <inheritdoc />
    public async Task<IReadOnlyList<TrendingTitle>> GetTrendingAsync(TrendingRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.ApiKey))
        {
            throw new InvalidOperationException("Aucune clé d'API TMDB n'est configurée.");
        }

        var results = new List<TrendingTitle>();

        if (request.MediaKind is TopListMediaKind.Movies or TopListMediaKind.Both)
        {
            results.AddRange(await FetchAsync("movie", request, cancellationToken).ConfigureAwait(false));
        }

        if (request.MediaKind is TopListMediaKind.Series or TopListMediaKind.Both)
        {
            results.AddRange(await FetchAsync("tv", request, cancellationToken).ConfigureAwait(false));
        }

        // Les deux listes sont fusionnées sur la popularité TMDB, puis renumérotées.
        return results
            .OrderByDescending(t => t.Popularity)
            .Take(request.Limit)
            .Select((t, index) => t with { Rank = index + 1 })
            .ToArray();
    }

    private async Task<IReadOnlyList<TrendingTitle>> FetchAsync(string mediaType, TrendingRequest request, CancellationToken cancellationToken)
    {
        var isMovie = string.Equals(mediaType, "movie", StringComparison.Ordinal);
        var url = BaseUrl + mediaType + "/week?language=" + Uri.EscapeDataString(request.Language);

        // TMDB accepte deux formes d'authentification : jeton v4 en en-tête Bearer, clé v3 en paramètre.
        var isBearerToken = request.ApiKey.StartsWith("eyJ", StringComparison.Ordinal);
        if (!isBearerToken)
        {
            url += "&api_key=" + Uri.EscapeDataString(request.ApiKey);
        }

        using var message = new HttpRequestMessage(HttpMethod.Get, url);
        message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (isBearerToken)
        {
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", request.ApiKey);
        }

        var httpClient = _httpClientFactory.CreateClient(NamedClient.Default);
        using var response = await httpClient.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        if (!document.RootElement.TryGetProperty("results", out var resultsElement)
            || resultsElement.ValueKind != JsonValueKind.Array)
        {
            _logger.LogWarning("Réponse TMDB inattendue pour {MediaType} : propriété « results » absente.", mediaType);
            return Array.Empty<TrendingTitle>();
        }

        var titles = new List<TrendingTitle>();
        var rank = 0;

        foreach (var element in resultsElement.EnumerateArray())
        {
            var title = ReadString(element, isMovie ? "title" : "name")
                        ?? ReadString(element, isMovie ? "original_title" : "original_name");
            if (string.IsNullOrWhiteSpace(title))
            {
                continue;
            }

            var tmdbId = element.TryGetProperty("id", out var idElement) && idElement.ValueKind == JsonValueKind.Number
                ? idElement.GetInt32().ToString(CultureInfo.InvariantCulture)
                : null;

            var popularity = element.TryGetProperty("popularity", out var popularityElement)
                             && popularityElement.ValueKind == JsonValueKind.Number
                ? popularityElement.GetDouble()
                : 0d;

            titles.Add(new TrendingTitle(
                ++rank,
                title,
                ParseYear(ReadString(element, isMovie ? "release_date" : "first_air_date")),
                tmdbId,
                ImdbId: null,
                isMovie,
                popularity));
        }

        return titles;
    }

    private static string? ReadString(JsonElement element, string propertyName)
        => element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static int? ParseYear(string? date)
        => !string.IsNullOrEmpty(date) && date.Length >= 4
           && int.TryParse(date.AsSpan(0, 4), NumberStyles.Integer, CultureInfo.InvariantCulture, out var year)
            ? year
            : null;
}
