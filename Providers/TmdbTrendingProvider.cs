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
    private const string BaseUrl = "https://api.themoviedb.org/3/";
    private const string PosterBaseUrl = "https://image.tmdb.org/t/p/w342";

    /// <summary>
    /// Nombre maximal de pages demandées à TMDB, à vingt résultats la page.
    /// </summary>
    /// <remarks>
    /// Cinq pages couvrent les cent candidats que <c>GlobalTopListBuilder</c> peut
    /// demander au plus. Au-delà, on paierait des appels pour des titres que le
    /// classement ne retiendrait jamais.
    /// </remarks>
    private const int MaxPages = 5;

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
        var path = ResolvePath(mediaType, isMovie, request.Feed);

        if (path is null)
        {
            // TMDB ne publie pas de « prochaines sorties » pour les séries. Ce type de média
            // est alors simplement absent du classement, plutôt que rabattu en silence sur
            // une autre liste que celle demandée.
            _logger.LogInformation(
                "TMDB ne publie pas la liste {Feed} pour {MediaType} : ce type est ignoré.",
                request.Feed,
                mediaType);
            return Array.Empty<TrendingTitle>();
        }

        // TMDB rend VINGT résultats par page, quoi qu'on demande. Sans pagination, le
        // sur-échantillonnage de GlobalTopListBuilder — « size × 5 », prévu pour qu'il reste
        // de quoi remplir les places après filtrage sur la bibliothèque — plafonnait en
        // réalité à vingt candidats, et la rangée arrivait incomplète sans que rien ne le
        // signale.
        var titles = new List<TrendingTitle>();
        var totalPages = 1;

        for (var page = 1; page <= totalPages && page <= MaxPages && titles.Count < request.Limit; page++)
        {
            var reported = await FetchPageAsync(path, page, isMovie, mediaType, request, titles, cancellationToken)
                .ConfigureAwait(false);

            // Zéro signale une réponse inexploitable : inutile d'insister sur les suivantes.
            if (reported <= 0)
            {
                break;
            }

            totalPages = reported;
        }

        return titles;
    }

    /// <summary>
    /// Récupère une page et y ajoute les titres lus. Renvoie le nombre total de pages
    /// annoncé par TMDB, ou zéro si la réponse est inexploitable.
    /// </summary>
    private async Task<int> FetchPageAsync(
        string path,
        int page,
        bool isMovie,
        string mediaType,
        TrendingRequest request,
        List<TrendingTitle> titles,
        CancellationToken cancellationToken)
    {
        var url = BaseUrl + path + "?language=" + Uri.EscapeDataString(request.Language)
            + "&page=" + page.ToString(CultureInfo.InvariantCulture);

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
            return 0;
        }

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

            var posterPath = ReadString(element, "poster_path");

            titles.Add(new TrendingTitle(
                titles.Count + 1,
                title,
                ParseYear(ReadString(element, isMovie ? "release_date" : "first_air_date")),
                tmdbId,
                ImdbId: null,
                isMovie,
                popularity,
                string.IsNullOrEmpty(posterPath) ? null : PosterBaseUrl + posterPath));
        }

        return document.RootElement.TryGetProperty("total_pages", out var pages)
               && pages.ValueKind == JsonValueKind.Number
            ? pages.GetInt32()
            : 1;
    }

    /// <summary>
    /// Chemin TMDB correspondant au couple type de média / liste demandée.
    /// </summary>
    /// <returns>Le chemin, ou <see langword="null"/> si TMDB n'offre pas cette combinaison.</returns>
    private static string? ResolvePath(string mediaType, bool isMovie, TrendingFeed feed)
    {
        switch (feed)
        {
            case TrendingFeed.NowPlaying:
                // Côté séries, l'équivalent d'« à l'affiche » est « en cours de diffusion ».
                return isMovie ? "movie/now_playing" : "tv/on_the_air";

            case TrendingFeed.Upcoming:
                return isMovie ? "movie/upcoming" : null;

            default:
                return "trending/" + mediaType + "/week";
        }
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
