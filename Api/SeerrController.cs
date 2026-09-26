using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Permet de demander à Seerr un titre du Top mondial absent de la bibliothèque.
/// </summary>
/// <remarks>
/// <para>
/// <b>Seuls les titres du Top mondial publié sont acceptés</b>, et seulement ceux qui ne
/// sont pas dans la bibliothèque — la même liste blanche que le relais d'affiches. Sans elle,
/// ces routes feraient de Media Carousel un relais de demandes Seerr pour n'importe quel
/// titre, ce qui n'est pas leur rôle.
/// </para>
/// <para>
/// Le compte concerné est toujours celui du jeton, jamais un paramètre. La clé d'API de Seerr
/// ne quitte jamais le serveur, et chaque demande part au nom du compte Seerr lié à
/// l'utilisateur : Seerr applique ses droits et ses quotas.
/// </para>
/// </remarks>
[ApiController]
[Authorize]
[Route("MediaCarousel/Seerr")]
[Produces("application/json")]
public class SeerrController : ControllerBase
{
    /// <summary>Un Top mondial compte au plus cent titres ; une page d'accueil en montre bien moins.</summary>
    private const int MaxItems = 20;

    /// <summary>
    /// Appels simultanés à Seerr au plus, pour un lot. Une rafale de vingt connexions peut être
    /// refusée par un petit serveur, ou par le proxy placé devant lui : les titres concernés
    /// perdaient alors leur bouton sans raison — constaté au banc, trois titres sur dix.
    /// </summary>
    private const int MaxParallel = 4;

    private const string UserIdClaim = "Jellyfin-UserId";

    private readonly SeerrClient _seerr;
    private readonly ITopListStore _store;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="SeerrController"/>.
    /// </summary>
    /// <param name="seerr">Client Seerr.</param>
    /// <param name="store">Classements publiés, qui font office de liste blanche.</param>
    public SeerrController(SeerrClient seerr, ITopListStore store)
    {
        _seerr = seerr;
        _store = store;
    }

    /// <summary>
    /// Renvoie l'état dans Seerr des titres demandés.
    /// </summary>
    /// <param name="items">Les titres, tels que les porte le Top mondial.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <response code="200">L'état de chaque titre accepté.</response>
    /// <response code="503">Les demandes Seerr ne sont pas activées.</response>
    /// <returns>Les états.</returns>
    [HttpPost("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<IReadOnlyList<SeerrStateDto>>> GetStates(
        [FromBody] SeerrItemDto[]? items,
        CancellationToken cancellationToken)
    {
        if (!TryGetSettings(out var baseUrl, out var apiKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        var published = PublishedTitles();
        var wanted = (items ?? Array.Empty<SeerrItemDto>())
            .Where(i => i is not null && IsPublished(published, i))
            .GroupBy(i => Key(i.MediaType!, i.TmdbId))
            .Select(g => g.First())
            .Take(MaxItems)
            .ToArray();

        using var gate = new SemaphoreSlim(MaxParallel);
        var states = await Task.WhenAll(wanted.Select(async item =>
        {
            await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                var outcome = await _seerr.GetStateAsync(baseUrl, apiKey, item.MediaType!, item.TmdbId, cancellationToken)
                    .ConfigureAwait(false);

                return new SeerrStateDto
                {
                    MediaType = item.MediaType!,
                    TmdbId = item.TmdbId,
                    State = outcome.State,
                    Error = ErrorCode(outcome.Failure)
                };
            }
            finally
            {
                gate.Release();
            }
        })).ConfigureAwait(false);

        return Ok(states);
    }

    /// <summary>
    /// Demande un titre à Seerr, au nom de l'appelant.
    /// </summary>
    /// <param name="item">Le titre, tel que le porte le Top mondial.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <response code="200">La demande est partie ; l'état qui s'ensuit.</response>
    /// <response code="400">Le titre n'est pas un titre absent du Top mondial publié.</response>
    /// <response code="403">Seerr refuse : droits ou quota du compte.</response>
    /// <response code="404">Aucun compte Seerr n'est lié à l'appelant.</response>
    /// <response code="502">Seerr est injoignable ou refuse la clé d'API.</response>
    /// <response code="503">Les demandes Seerr ne sont pas activées.</response>
    /// <returns>L'état du titre après la demande.</returns>
    [HttpPost("Request")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<SeerrStateDto>> RequestTitle(
        [FromBody] SeerrItemDto? item,
        CancellationToken cancellationToken)
    {
        if (!TryGetSettings(out var baseUrl, out var apiKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        if (item is null || !IsPublished(PublishedTitles(), item))
        {
            return BadRequest();
        }

        // Une série se demande saison par saison, un film jamais : le client ne peut pas
        // glisser de saisons dans la demande d'un film.
        var isTv = string.Equals(item.MediaType, SeerrRules.Tv, StringComparison.Ordinal);
        var seasons = isTv ? SeerrRules.NormalizeSeasons(item.Seasons) : null;
        if (isTv ? seasons is null : item.Seasons is { Length: > 0 })
        {
            return BadRequest();
        }

        var userId = ResolveUserId();
        if (userId == Guid.Empty)
        {
            // Une clé d'API n'est rattachée à aucun compte : personne au nom de qui demander.
            return Forbid();
        }

        var outcome = await _seerr.RequestAsync(baseUrl, apiKey, userId, item.MediaType!, item.TmdbId, seasons, cancellationToken)
            .ConfigureAwait(false);

        var dto = new SeerrStateDto
        {
            MediaType = item.MediaType!,
            TmdbId = item.TmdbId,
            State = outcome.State,
            Error = ErrorCode(outcome.Failure)
        };

        return outcome.Failure switch
        {
            SeerrFailure.None => Ok(dto),
            SeerrFailure.UserNotFound => NotFound(dto),
            SeerrFailure.Forbidden => StatusCode(StatusCodes.Status403Forbidden, dto),
            _ => StatusCode(StatusCodes.Status502BadGateway, dto)
        };
    }

    /// <summary>
    /// Saisons d'une série absente, pour la fenêtre de choix des saisons.
    /// </summary>
    /// <param name="item">La série.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Les saisons et le réglage des demandes partielles.</returns>
    [HttpPost("Seasons")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<SeerrSeasonsDto>> GetSeasons(
        [FromBody] SeerrItemDto? item,
        CancellationToken cancellationToken)
    {
        if (!TryGetSettings(out var baseUrl, out var apiKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        if (item is null
            || !string.Equals(item.MediaType, SeerrRules.Tv, StringComparison.Ordinal)
            || !IsPublished(PublishedTitles(), item))
        {
            return BadRequest();
        }

        var (choice, failure) = await _seerr.GetSeasonsAsync(baseUrl, apiKey, item.TmdbId, cancellationToken)
            .ConfigureAwait(false);

        if (choice is null)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new SeerrStateDto
            {
                MediaType = SeerrRules.Tv,
                TmdbId = item.TmdbId,
                Error = ErrorCode(failure)
            });
        }

        return Ok(new SeerrSeasonsDto
        {
            PartialRequests = choice.PartialRequests,
            Seasons = choice.Seasons.Select(s => new SeerrSeasonDto
            {
                Number = s.Number,
                Name = s.Name,
                Year = s.Year,
                Episodes = s.Episodes,
                State = s.State,
                Requestable = s.Requestable
            }).ToArray()
        });
    }

    /// <summary>
    /// Vérifie une adresse et une clé Seerr, avant même qu'elles soient enregistrées.
    /// </summary>
    /// <param name="request">L'adresse et la clé saisies dans la page de configuration.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <response code="200">Le résultat de la vérification.</response>
    /// <returns>Le résultat.</returns>
    [HttpPost("Test")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<SeerrTestResultDto>> Test(
        [FromBody] SeerrTestRequestDto? request,
        CancellationToken cancellationToken)
    {
        var baseUrl = SeerrRules.NormalizeBaseUrl(request?.Url);

        if (baseUrl is null || string.IsNullOrWhiteSpace(request?.ApiKey))
        {
            return Ok(new SeerrTestResultDto { Ok = false, Error = "invalid" });
        }

        var failure = await _seerr.TestAsync(baseUrl, request.ApiKey.Trim(), cancellationToken).ConfigureAwait(false);

        return Ok(new SeerrTestResultDto
        {
            Ok = failure == SeerrFailure.None,
            Error = failure == SeerrFailure.None ? null : ErrorCode(failure)
        });
    }

    /// <summary>
    /// Indique si l'intégration est activée et complète.
    /// </summary>
    /// <param name="config">La configuration du plugin.</param>
    /// <returns><see langword="true"/> si les demandes peuvent être proposées.</returns>
    internal static bool IsConfigured(Configuration.PluginConfiguration? config)
        => config is not null
            && config.EnableSeerrRequests
            && SeerrRules.NormalizeBaseUrl(config.SeerrUrl) is not null
            && !string.IsNullOrWhiteSpace(config.SeerrApiKey);

    private static bool TryGetSettings(out string baseUrl, out string apiKey)
    {
        var config = Plugin.Instance?.Configuration;

        if (!IsConfigured(config))
        {
            baseUrl = string.Empty;
            apiKey = string.Empty;
            return false;
        }

        baseUrl = SeerrRules.NormalizeBaseUrl(config!.SeerrUrl)!;
        apiKey = config.SeerrApiKey.Trim();
        return true;
    }

    /// <summary>
    /// Les titres absents de la bibliothèque dans le Top mondial publié.
    /// </summary>
    private HashSet<string> PublishedTitles()
    {
        var titles = new HashSet<string>(StringComparer.Ordinal);

        foreach (var entry in _store.Get(TopListKind.Global).Entries)
        {
            if (!entry.IsInLibrary
                && SeerrRules.IsMediaType(entry.MediaType)
                && int.TryParse(entry.TmdbId, NumberStyles.None, CultureInfo.InvariantCulture, out var tmdbId))
            {
                titles.Add(Key(entry.MediaType!, tmdbId));
            }
        }

        return titles;
    }

    private static bool IsPublished(HashSet<string> published, SeerrItemDto item)
        => SeerrRules.IsMediaType(item.MediaType)
            && item.TmdbId > 0
            && published.Contains(Key(item.MediaType!, item.TmdbId));

    private static string Key(string mediaType, int tmdbId)
        => mediaType + ":" + tmdbId.ToString(CultureInfo.InvariantCulture);

    private static string? ErrorCode(SeerrFailure failure) => failure switch
    {
        SeerrFailure.None => null,
        SeerrFailure.UserNotFound => "user-not-found",
        SeerrFailure.Forbidden => "forbidden",
        SeerrFailure.Unauthorized => "unauthorized",
        SeerrFailure.Offline => "offline",
        _ => "error"
    };

    private Guid ResolveUserId()
    {
        var claim = User.Claims
            .FirstOrDefault(c => string.Equals(c.Type, UserIdClaim, StringComparison.OrdinalIgnoreCase))?.Value;

        return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
    }
}

/// <summary>
/// Un titre du Top mondial, tel que le client le désigne.
/// </summary>
public sealed class SeerrItemDto
{
    /// <summary>Obtient ou définit le type de média, <c>movie</c> ou <c>tv</c>.</summary>
    public string? MediaType { get; set; }

    /// <summary>Obtient ou définit l'identifiant TMDB.</summary>
    public int TmdbId { get; set; }

    /// <summary>
    /// Obtient ou définit les saisons demandées, pour une série.
    /// </summary>
    public int[]? Seasons { get; set; }
}

/// <summary>
/// Le choix des saisons d'une série.
/// </summary>
public sealed class SeerrSeasonsDto
{
    /// <summary>
    /// Obtient ou définit une valeur indiquant si Seerr accepte une demande qui ne couvre pas
    /// toutes les saisons.
    /// </summary>
    public bool PartialRequests { get; set; }

    /// <summary>
    /// Obtient ou définit les saisons proposées.
    /// </summary>
    public IReadOnlyList<SeerrSeasonDto> Seasons { get; set; } = Array.Empty<SeerrSeasonDto>();
}

/// <summary>
/// Une saison du choix des saisons.
/// </summary>
public sealed class SeerrSeasonDto
{
    /// <summary>Obtient ou définit le numéro ; 0 pour les épisodes spéciaux.</summary>
    public int Number { get; set; }

    /// <summary>Obtient ou définit le nom donné par Seerr, s'il n'est pas qu'un numéro.</summary>
    public string? Name { get; set; }

    /// <summary>Obtient ou définit l'année de diffusion.</summary>
    public string? Year { get; set; }

    /// <summary>Obtient ou définit le nombre d'épisodes.</summary>
    public int Episodes { get; set; }

    /// <summary>Obtient ou définit l'état de la saison.</summary>
    public string State { get; set; } = string.Empty;

    /// <summary>Obtient ou définit une valeur indiquant si la saison peut être demandée.</summary>
    public bool Requestable { get; set; }
}

/// <summary>
/// L'état d'un titre dans Seerr.
/// </summary>
public sealed class SeerrStateDto
{
    /// <summary>Obtient ou définit le type de média.</summary>
    public string MediaType { get; set; } = string.Empty;

    /// <summary>Obtient ou définit l'identifiant TMDB.</summary>
    public int TmdbId { get; set; }

    /// <summary>
    /// Obtient ou définit l'état du bouton : <c>request</c>, <c>pending</c>, <c>processing</c>,
    /// <c>partial</c>, <c>available</c> ou <c>blocked</c>.
    /// </summary>
    public string? State { get; set; }

    /// <summary>
    /// Obtient ou définit la raison de l'échec : <c>user-not-found</c>, <c>forbidden</c>,
    /// <c>unauthorized</c>, <c>offline</c> ou <c>error</c>.
    /// </summary>
    public string? Error { get; set; }
}

/// <summary>
/// Adresse et clé à vérifier.
/// </summary>
public sealed class SeerrTestRequestDto
{
    /// <summary>Obtient ou définit l'adresse de Seerr.</summary>
    public string? Url { get; set; }

    /// <summary>Obtient ou définit la clé d'API.</summary>
    public string? ApiKey { get; set; }
}

/// <summary>
/// Résultat d'une vérification.
/// </summary>
public sealed class SeerrTestResultDto
{
    /// <summary>Obtient ou définit une valeur indiquant si Seerr accepte l'adresse et la clé.</summary>
    public bool Ok { get; set; }

    /// <summary>Obtient ou définit la raison de l'échec.</summary>
    public string? Error { get; set; }
}
