using System;
using System.Linq;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Enums;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.ScheduledTasks;
using JellyfinCarouselPlugin.Services;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Tasks;
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
    private readonly PlaybackReportingReader _playback;
    private readonly ActivityStats _activity;
    private readonly UserPreferenceStore _preferences;
    private readonly ITaskManager _taskManager;
    private readonly IUserManager _userManager;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="StatusController"/>.
    /// </summary>
    /// <param name="topListStore">Stockage des classements.</param>
    /// <param name="catalogStore">Stockage des catalogues.</param>
    /// <param name="health">Bilan du dernier recalcul.</param>
    /// <param name="playback">Lecteur de l'historique de Playback Reporting.</param>
    /// <param name="activity">Activité relevée par le dernier calcul du Top du serveur.</param>
    /// <param name="preferences">Choix enregistrés par les comptes.</param>
    /// <param name="userManager">Gestionnaire des comptes.</param>
    /// <param name="taskManager">Gestionnaire des tâches planifiées, pour le prochain passage.</param>
    public StatusController(
        ITopListStore topListStore,
        ICatalogStore catalogStore,
        RefreshHealth health,
        PlaybackReportingReader playback,
        ActivityStats activity,
        UserPreferenceStore preferences,
        IUserManager userManager,
        ITaskManager taskManager)
    {
        _topListStore = topListStore;
        _catalogStore = catalogStore;
        _health = health;
        _playback = playback;
        _activity = activity;
        _preferences = preferences;
        _userManager = userManager;
        _taskManager = taskManager;
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

        // Le Top mondial se lit sur ses trois listes : mêlée, ou films et séries séparés. La
        // tuile compte leurs titres ensemble et date le plus récent des calculs.
        var globals = GlobalTopKinds.All.Select(_topListStore.Get).Where(s => s.Entries.Count > 0).ToArray();
        var allTime = _topListStore.Get(TopListKind.LocalAllTime);
        var neverPlayed = _topListStore.Get(TopListKind.NeverPlayed);
        var returning = _topListStore.Get(TopListKind.ReturningSeries);
        var studios = _catalogStore.Get(CatalogKind.Studios);
        var genres = _catalogStore.Get(CatalogKind.Genres);
        var (report, running) = _health.Snapshot();
        var coverage = GlobalTopCoverage.Measure(config?.IsGlobalTopSplit() ?? false, _topListStore.Get);
        var activity = _playback.IsAvailable ? _activity.Get() : null;
        var nextRun = NextRun(report.StartedUtc);

        var accounts = _userManager.GetUsers()
            .Where(u => !u.HasPermission(PermissionKind.IsDisabled))
            .Select(u => u.Id)
            .ToArray();

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
                Count = globals.Sum(s => s.Entries.Count),
                Source = globals.Length > 0 ? globals[0].Source : "None",
                GeneratedUtc = globals.Length > 0 ? globals.Max(s => s.GeneratedUtc) : null
            },
            AllTime = new SectionStatusDto
            {
                Enabled = config?.EnableAllTimeRow ?? false,
                Count = allTime.Entries.Count,
                Source = allTime.Source,
                GeneratedUtc = allTime.Entries.Count > 0 ? allTime.GeneratedUtc : null
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
            },
            PlaybackReporting = _playback.IsAvailable,
            FileTransformation = ScriptInjectionTask.IsFileTransformationLoaded(),
            Activity = activity is null ? null : new ActivityDto
            {
                Viewers = activity.Activity.Viewers,
                Views = activity.Activity.Views,
                Hours = Math.Round(activity.Activity.Seconds / 3600.0, 1),
                WindowDays = activity.WindowDays
            },
            GlobalInLibrary = coverage.InLibrary,
            GlobalTotal = coverage.Total,
            CustomizedAccounts = _preferences.Count(accounts),
            Accounts = accounts.Length,
            NextRunUtc = nextRun
        });
    }

    /// <summary>
    /// Estime le prochain recalcul d'après le déclencheur d'intervalle de la tâche planifiée.
    /// </summary>
    /// <remarks>
    /// Le calendrier appartient à Jellyfin : on lit son déclencheur, sans le réécrire. Sans
    /// déclencheur d'intervalle (quotidien seul, par exemple), rien n'est annoncé.
    /// </remarks>
    private DateTime? NextRun(DateTime? lastStartUtc)
    {
        var worker = _taskManager.ScheduledTasks.FirstOrDefault(t => t.ScheduledTask is TopListRefreshTask);
        var interval = worker?.Triggers
            .Where(t => t.Type == TaskTriggerInfoType.IntervalTrigger && t.IntervalTicks > 0)
            .Select(t => t.IntervalTicks!.Value)
            .DefaultIfEmpty(0)
            .Min() ?? 0;

        var last = worker?.LastExecutionResult?.EndTimeUtc ?? lastStartUtc;
        return interval > 0 && last.HasValue && last.Value > DateTime.MinValue
            ? last.Value.AddTicks(interval)
            : null;
    }
}
