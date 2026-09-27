using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Net;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Ce qui a empêché un échange avec Seerr d'aboutir.
/// </summary>
public enum SeerrFailure
{
    /// <summary>L'échange a abouti.</summary>
    None,

    /// <summary>Seerr ne répond pas, ou pas en JSON — un proxy qui renvoie sa propre page, par exemple.</summary>
    Offline,

    /// <summary>Seerr refuse la clé d'API.</summary>
    Unauthorized,

    /// <summary>Le compte Seerr n'a pas le droit de demander, ou a épuisé son quota.</summary>
    Forbidden,

    /// <summary>Aucun compte Seerr n'est lié à ce compte Jellyfin.</summary>
    UserNotFound,

    /// <summary>Tout autre refus.</summary>
    Error
}

/// <summary>
/// Issue d'un échange avec Seerr : un état du bouton, ou la raison de l'échec.
/// </summary>
/// <param name="State">L'état du bouton, quand l'échange a abouti.</param>
/// <param name="Failure">La raison de l'échec, ou <see cref="SeerrFailure.None"/>.</param>
public readonly record struct SeerrOutcome(string? State, SeerrFailure Failure)
{
    /// <summary>Un échange abouti.</summary>
    /// <param name="state">L'état du bouton.</param>
    /// <returns>L'issue.</returns>
    public static SeerrOutcome Ok(string state) => new(state, SeerrFailure.None);

    /// <summary>Un échange en échec.</summary>
    /// <param name="failure">La raison.</param>
    /// <returns>L'issue.</returns>
    public static SeerrOutcome Fail(SeerrFailure failure) => new(null, failure);
}

/// <summary>
/// Le choix des saisons d'une série : les saisons, et si Seerr accepte d'en demander une partie.
/// </summary>
/// <param name="PartialRequests">Vrai si Seerr accepte une demande qui ne couvre pas toutes les saisons.</param>
/// <param name="Seasons">Les saisons proposées.</param>
public sealed record SeerrSeasonChoice(bool PartialRequests, IReadOnlyList<SeerrSeason> Seasons);

/// <summary>
/// Dialogue avec Seerr, depuis le serveur.
/// </summary>
/// <remarks>
/// <para>
/// La clé d'API ne quitte jamais le serveur : les navigateurs parlent à nos routes, jamais
/// à Seerr. Chaque demande part au nom du compte Seerr lié à l'utilisateur Jellyfin,
/// désigné par <c>X-Api-User</c> — Seerr applique alors ses droits et ses quotas.
/// </para>
/// <para>
/// L'association des comptes est gardée dix minutes — une minute quand elle échoue, pour
/// qu'un compte importé entre-temps dans Seerr n'attende pas —, et le statut d'un titre une
/// minute : la page d'accueil ne doit pas solliciter Seerr à chaque affichage.
/// </para>
/// </remarks>
public sealed class SeerrClient
{
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan UserHit = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan UserMiss = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan StateLifetime = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan SettingsLifetime = TimeSpan.FromMinutes(10);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SeerrClient> _logger;
    private readonly ConcurrentDictionary<Guid, (int? Id, DateTime At)> _users = new();
    private readonly ConcurrentDictionary<string, (string State, DateTime At)> _states = new(StringComparer.Ordinal);
    private (string BaseUrl, bool PartialRequests, bool SpecialEpisodes, DateTime At)? _settings;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="SeerrClient"/>.
    /// </summary>
    /// <param name="httpClientFactory">Fabrique de clients HTTP de Jellyfin.</param>
    /// <param name="logger">Journal.</param>
    public SeerrClient(IHttpClientFactory httpClientFactory, ILogger<SeerrClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// Renvoie l'état d'un titre dans Seerr.
    /// </summary>
    /// <param name="baseUrl">Adresse de Seerr.</param>
    /// <param name="apiKey">Clé d'API.</param>
    /// <param name="mediaType"><c>movie</c> ou <c>tv</c>.</param>
    /// <param name="tmdbId">Identifiant TMDB.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>L'état du bouton, ou la raison de l'échec.</returns>
    public async Task<SeerrOutcome> GetStateAsync(
        string baseUrl,
        string apiKey,
        string mediaType,
        int tmdbId,
        CancellationToken cancellationToken)
    {
        var key = StateKey(mediaType, tmdbId);

        if (_states.TryGetValue(key, out var cached) && DateTime.UtcNow - cached.At < StateLifetime)
        {
            return SeerrOutcome.Ok(cached.State);
        }

        // Les épisodes spéciaux ne comptent, pour une série, que si Seerr les accepte.
        var specials = string.Equals(mediaType, SeerrRules.Tv, StringComparison.Ordinal)
            && (await GetSettingsAsync(baseUrl, apiKey, cancellationToken).ConfigureAwait(false)).SpecialEpisodes;

        var (status, body) = await SendAsync(
            HttpMethod.Get,
            baseUrl + "/api/v1/" + mediaType + "/" + tmdbId.ToString(CultureInfo.InvariantCulture),
            apiKey,
            null,
            null,
            cancellationToken).ConfigureAwait(false);

        var failure = Classify(status, body);
        if (failure != SeerrFailure.None)
        {
            return SeerrOutcome.Fail(failure);
        }

        string state;
        try
        {
            state = SeerrRules.ReadState(body!, mediaType, specials);
        }
        catch (JsonException)
        {
            // Annoncé comme du JSON, illisible pourtant : ce n'est pas une réponse de Seerr. Sans
            // cette garde, l'exception faisait échouer tout le lot, et non ce seul titre.
            return SeerrOutcome.Fail(SeerrFailure.Error);
        }

        _states[key] = (state, DateTime.UtcNow);
        return SeerrOutcome.Ok(state);
    }

    /// <summary>
    /// Demande un titre à Seerr, au nom d'un compte Jellyfin.
    /// </summary>
    /// <param name="baseUrl">Adresse de Seerr.</param>
    /// <param name="apiKey">Clé d'API.</param>
    /// <param name="jellyfinUserId">Compte Jellyfin à l'origine de la demande.</param>
    /// <param name="mediaType"><c>movie</c> ou <c>tv</c>.</param>
    /// <param name="tmdbId">Identifiant TMDB.</param>
    /// <param name="seasons">Saisons demandées, pour une série ; <see langword="null"/> pour un film.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>L'état du bouton après la demande, ou la raison de l'échec.</returns>
    public async Task<SeerrOutcome> RequestAsync(
        string baseUrl,
        string apiKey,
        Guid jellyfinUserId,
        string mediaType,
        int tmdbId,
        IReadOnlyList<int>? seasons,
        CancellationToken cancellationToken)
    {
        var (seerrUserId, lookupFailure) = await FindUserAsync(baseUrl, apiKey, jellyfinUserId, cancellationToken)
            .ConfigureAwait(false);

        if (lookupFailure != SeerrFailure.None)
        {
            return SeerrOutcome.Fail(lookupFailure);
        }

        if (seerrUserId is null)
        {
            return SeerrOutcome.Fail(SeerrFailure.UserNotFound);
        }

        var (status, body) = await SendAsync(
            HttpMethod.Post,
            baseUrl + "/api/v1/request",
            apiKey,
            seerrUserId,
            SeerrRules.BuildRequestBody(mediaType, tmdbId, seasons),
            cancellationToken).ConfigureAwait(false);

        var key = StateKey(mediaType, tmdbId);
        _states.TryRemove(key, out _);

        // Le titre a été demandé entre-temps, par ce compte ou un autre : ce n'est pas un
        // échec, l'utilisateur voit simplement où en est la demande existante.
        if (status == HttpStatusCode.Conflict)
        {
            return await GetStateAsync(baseUrl, apiKey, mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
        }

        var failure = Classify(status, body);
        if (failure != SeerrFailure.None)
        {
            if (failure == SeerrFailure.Forbidden)
            {
                _logger.LogInformation(
                    "Seerr a refusé la demande du compte {SeerrUserId} : droits ou quota.",
                    seerrUserId);
            }

            return SeerrOutcome.Fail(failure);
        }

        // Un film demandé est « Demandé », comme chez Jellyfin Enhanced, qu'il attende ou non
        // une approbation. Une série, elle, se relit : selon les saisons demandées, elle peut
        // rester demandable.
        if (!string.Equals(mediaType, SeerrRules.Tv, StringComparison.Ordinal))
        {
            _states[key] = (SeerrRules.StateRequested, DateTime.UtcNow);
            return SeerrOutcome.Ok(SeerrRules.StateRequested);
        }

        var reread = await GetStateAsync(baseUrl, apiKey, mediaType, tmdbId, cancellationToken).ConfigureAwait(false);

        // La demande est partie : si seule la relecture échoue, l'annoncer comme un échec
        // pousserait à redemander des saisons déjà demandées.
        return reread.Failure == SeerrFailure.None ? reread : SeerrOutcome.Ok(SeerrRules.StateRequested);
    }

    /// <summary>
    /// Lit les saisons d'une série et les réglages de Seerr qui décident de leur choix.
    /// </summary>
    /// <remarks>
    /// Jamais servi depuis le cache : la fenêtre s'ouvre pour demander, elle doit montrer ce
    /// qui est demandé à cet instant.
    /// </remarks>
    /// <param name="baseUrl">Adresse de Seerr.</param>
    /// <param name="apiKey">Clé d'API de Seerr.</param>
    /// <param name="tmdbId">Identifiant TMDB de la série.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Les saisons, ou la raison de l'échec.</returns>
    public async Task<(SeerrSeasonChoice? Choice, SeerrFailure Failure)> GetSeasonsAsync(
        string baseUrl,
        string apiKey,
        int tmdbId,
        CancellationToken cancellationToken)
    {
        var settings = await GetSettingsAsync(baseUrl, apiKey, cancellationToken).ConfigureAwait(false);

        var (status, body) = await SendAsync(
            HttpMethod.Get,
            baseUrl + "/api/v1/tv/" + tmdbId.ToString(CultureInfo.InvariantCulture),
            apiKey,
            null,
            null,
            cancellationToken).ConfigureAwait(false);

        var failure = Classify(status, body);
        if (failure != SeerrFailure.None)
        {
            return (null, failure);
        }

        try
        {
            var seasons = SeerrRules.ReadSeasons(body!, settings.SpecialEpisodes);
            _states[StateKey(SeerrRules.Tv, tmdbId)] = (SeerrRules.ReadState(body!, SeerrRules.Tv, settings.SpecialEpisodes), DateTime.UtcNow);
            return (new SeerrSeasonChoice(settings.PartialRequests, seasons), SeerrFailure.None);
        }
        catch (JsonException)
        {
            return (null, SeerrFailure.Error);
        }
    }

    /// <summary>
    /// Vérifie qu'une adresse et une clé permettent de parler à Seerr.
    /// </summary>
    /// <param name="baseUrl">Adresse à vérifier.</param>
    /// <param name="apiKey">Clé à vérifier.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns><see cref="SeerrFailure.None"/> si Seerr accepte la clé.</returns>
    public async Task<SeerrFailure> TestAsync(string baseUrl, string apiKey, CancellationToken cancellationToken)
    {
        var (status, body) = await SendAsync(
            HttpMethod.Get,
            baseUrl + "/api/v1/auth/me",
            apiKey,
            null,
            null,
            cancellationToken).ConfigureAwait(false);

        return Classify(status, body);
    }

    private async Task<(int? Id, SeerrFailure Failure)> FindUserAsync(
        string baseUrl,
        string apiKey,
        Guid jellyfinUserId,
        CancellationToken cancellationToken)
    {
        if (_users.TryGetValue(jellyfinUserId, out var cached)
            && DateTime.UtcNow - cached.At < (cached.Id.HasValue ? UserHit : UserMiss))
        {
            return (cached.Id, SeerrFailure.None);
        }

        var (status, body) = await SendAsync(
            HttpMethod.Get,
            baseUrl + "/api/v1/user?take=1000",
            apiKey,
            null,
            null,
            cancellationToken).ConfigureAwait(false);

        var failure = Classify(status, body);
        if (failure != SeerrFailure.None)
        {
            return (null, failure);
        }

        int? id;
        try
        {
            id = SeerrRules.FindSeerrUserId(body!, jellyfinUserId);
        }
        catch (JsonException)
        {
            return (null, SeerrFailure.Offline);
        }

        if (id is null)
        {
            _logger.LogInformation(
                "Aucun compte Seerr n'est lié au compte Jellyfin {UserId} : importez-le depuis Seerr.",
                jellyfinUserId);
        }

        _users[jellyfinUserId] = (id, DateTime.UtcNow);
        return (id, SeerrFailure.None);
    }

    // Demandes partielles et épisodes spéciaux, lus comme le fait Jellyfin Enhanced. Faute de
    // réponse, les deux sont faux — la même prudence que lui : on demande alors toutes les
    // saisons ordinaires, jamais les spéciaux.
    private async Task<(bool PartialRequests, bool SpecialEpisodes)> GetSettingsAsync(
        string baseUrl,
        string apiKey,
        CancellationToken cancellationToken)
    {
        if (_settings is { } cached && cached.BaseUrl == baseUrl && DateTime.UtcNow - cached.At < SettingsLifetime)
        {
            return (cached.PartialRequests, cached.SpecialEpisodes);
        }

        var (status, body) = await SendAsync(
            HttpMethod.Get,
            baseUrl + "/api/v1/settings/main",
            apiKey,
            null,
            null,
            cancellationToken).ConfigureAwait(false);

        if (Classify(status, body) != SeerrFailure.None)
        {
            return (false, false);
        }

        try
        {
            var (partial, specials) = SeerrRules.ReadRequestSettings(body!);
            _settings = (baseUrl, partial, specials, DateTime.UtcNow);
            return (partial, specials);
        }
        catch (JsonException)
        {
            return (false, false);
        }
    }

    private SeerrFailure Classify(HttpStatusCode? status, string? body)
    {
        switch (status)
        {
            case null:
                return SeerrFailure.Offline;
            case HttpStatusCode.Unauthorized:
                _logger.LogWarning("Seerr refuse la clé d'API configurée dans Media Carousel.");
                return SeerrFailure.Unauthorized;
            case HttpStatusCode.Forbidden:
                return SeerrFailure.Forbidden;
        }

        var code = (int)status.Value;

        if (code >= 500)
        {
            return SeerrFailure.Offline;
        }

        if (code >= 400)
        {
            return SeerrFailure.Error;
        }

        // Un succès sans JSON n'est pas Seerr : typiquement un proxy qui intercepte la requête
        // pour afficher sa propre page de connexion.
        return body is null ? SeerrFailure.Offline : SeerrFailure.None;
    }

    private async Task<(HttpStatusCode? Status, string? Body)> SendAsync(
        HttpMethod method,
        string url,
        string apiKey,
        int? seerrUserId,
        string? jsonBody,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient(NamedClient.Default);

        using var request = new HttpRequestMessage(method, url);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.TryAddWithoutValidation("X-Api-Key", apiKey);

        if (seerrUserId.HasValue)
        {
            request.Headers.TryAddWithoutValidation("X-Api-User", seerrUserId.Value.ToString(CultureInfo.InvariantCulture));
        }

        if (jsonBody is not null)
        {
            request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(RequestTimeout);

        try
        {
            using var response = await client.SendAsync(request, timeout.Token).ConfigureAwait(false);
            var mediaType = response.Content.Headers.ContentType?.MediaType;
            var body = mediaType is not null && mediaType.Contains("json", StringComparison.OrdinalIgnoreCase)
                ? await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false)
                : null;
            return (response.StatusCode, body);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Seerr n'a pas répondu en {Seconds} s.", RequestTimeout.TotalSeconds);
            return (null, null);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Seerr est injoignable.");
            return (null, null);
        }
    }

    private static string StateKey(string mediaType, int tmdbId)
        => mediaType + ":" + tmdbId.ToString(CultureInfo.InvariantCulture);
}
