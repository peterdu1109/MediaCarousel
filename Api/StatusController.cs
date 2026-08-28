using System.Linq;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Expose l'état courant du plugin à la page de configuration, pour que l'administrateur
/// voie ce qui a réellement été calculé plutôt que d'avoir à lire le journal du serveur.
/// </summary>
[ApiController]
[Authorize(Policy = "RequiresElevation")]
[Route("MediaCarousel")]
[Produces("application/json")]
public class StatusController : ControllerBase
{
    private readonly ITopListStore _topListStore;
    private readonly ICatalogStore _catalogStore;
    private readonly RefreshHealth _health;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="StatusController"/>.
    /// </summary>
    /// <param name="topListStore">Stockage des classements.</param>
    /// <param name="catalogStore">Stockage des catalogues.</param>
    /// <param name="health">Bilan du dernier recalcul.</param>
    public StatusController(ITopListStore topListStore, ICatalogStore catalogStore, RefreshHealth health)
    {
        _topListStore = topListStore;
        _catalogStore = catalogStore;
        _health = health;
    }

    /// <summary>
    /// Renvoie l'état des classements et des catalogues.
    /// </summary>
    /// <response code="200">L'état du plugin.</response>
    /// <returns>L'état du plugin.</returns>
    [HttpGet("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<PluginStatusDto> GetStatus()
    {
        var plugin = Plugin.Instance;
        var config = plugin?.Configuration;

        var local = _topListStore.Get(TopListKind.Local);
        var global = _topListStore.Get(TopListKind.Global);
        var neverPlayed = _topListStore.Get(TopListKind.NeverPlayed);
        var returning = _topListStore.Get(TopListKind.ReturningSeries);
        var studios = _catalogStore.Get(CatalogKind.Studios);
        var genres = _catalogStore.Get(CatalogKind.Genres);
        var (report, running) = _health.Snapshot();

        return Ok(new PluginStatusDto
        {
            Version = plugin?.Version?.ToString() ?? string.Empty,
            LocalTop = new SectionStatusDto
            {
                Enabled = config?.EnableLocalTop ?? false,
                Count = local.Entries.Count,
                Source = local.Source,
                GeneratedUtc = local.Entries.Count > 0 ? local.GeneratedUtc : null
            },
            GlobalTop = new SectionStatusDto
            {
                Enabled = config?.EnableGlobalTop ?? false,
                Count = global.Entries.Count,
                Source = global.Source,
                GeneratedUtc = global.Entries.Count > 0 ? global.GeneratedUtc : null
            },
            NeverPlayed = new SectionStatusDto
            {
                Enabled = config?.EnableNeverPlayedRow ?? false,
                Count = neverPlayed.Entries.Count,
                Source = neverPlayed.Source,
                GeneratedUtc = neverPlayed.Entries.Count > 0 ? neverPlayed.GeneratedUtc : null
            },
            ReturningSeries = new SectionStatusDto
            {
                Enabled = config?.EnableReturningRow ?? false,
                Count = returning.Entries.Count,
                Source = returning.Source,
                GeneratedUtc = returning.Entries.Count > 0 ? returning.GeneratedUtc : null
            },
            Studios = new SectionStatusDto
            {
                Enabled = config?.EnableStudioRow ?? false,
                Count = studios.Entries.Count,
                Source = "Jellyfin",
                GeneratedUtc = studios.Entries.Count > 0 ? studios.GeneratedUtc : null
            },
            Genres = new SectionStatusDto
            {
                Enabled = config?.EnableGenreRows ?? false,
                Count = genres.Entries.Count,
                Source = "Jellyfin",
                GeneratedUtc = genres.Entries.Count > 0 ? genres.GeneratedUtc : null
            },
            LastRun = new RefreshReportDto
            {
                StartedUtc = report.StartedUtc,
                DurationSeconds = report.DurationSeconds,
                Running = running,
                Failures = report.Failures
                    .Select(f => new RefreshFailureDto { Section = f.Section, Message = f.Message })
                    .ToArray()
            }
        });
    }
}
