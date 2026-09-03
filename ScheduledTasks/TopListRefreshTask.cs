using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Services;
using MediaBrowser.Model.Tasks;

namespace JellyfinCarouselPlugin.ScheduledTasks;

/// <summary>
/// Tâche planifiée qui recalcule les classements. C'est le seul endroit où le travail lourd
/// est effectué : les requêtes HTTP des clients se contentent de lire l'instantané publié.
/// </summary>
public sealed class TopListRefreshTask : IScheduledTask
{
    private const int DefaultIntervalHours = 6;

    /// <summary>
    /// Lit l'intervalle de recalcul configuré, borné aux valeurs acceptables.
    /// </summary>
    /// <remarks>
    /// Exposé parce que <see cref="JellyfinCarouselPlugin.Services.RefreshScheduleSynchronizer"/>
    /// doit lire exactement la même valeur : c'est lui qui applique le réglage après la
    /// première installation, <see cref="GetDefaultTriggers"/> n'étant plus consulté ensuite.
    /// </remarks>
    /// <returns>L'intervalle en heures, entre 1 et 168.</returns>
    public static int ResolveIntervalHours()
    {
        // La configuration peut ne pas être encore chargée au moment de l'enregistrement.
        var hours = Plugin.Instance?.Configuration.RefreshIntervalHours ?? DefaultIntervalHours;
        return Math.Clamp(hours, 1, 168);
    }

    private readonly TopListRefreshService _refreshService;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TopListRefreshTask"/>.
    /// </summary>
    /// <param name="refreshService">Service de rafraîchissement.</param>
    public TopListRefreshTask(TopListRefreshService refreshService)
    {
        _refreshService = refreshService;
    }

    /// <inheritdoc />
    public string Name => "Recalcul des classements MediaCarousel";

    /// <inheritdoc />
    public string Key => "MediaCarousel.TopListRefresh";

    /// <inheritdoc />
    public string Description => "Recalcule le Top du serveur à partir des statistiques de lecture et récupère le Top mondial auprès de la source externe configurée.";

    /// <inheritdoc />
    public string Category => "MediaCarousel";

    /// <inheritdoc />
    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        => _refreshService.RefreshAsync(progress, cancellationToken);

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        yield return new TaskTriggerInfo
        {
            Type = TaskTriggerInfoType.StartupTrigger
        };

        yield return new TaskTriggerInfo
        {
            Type = TaskTriggerInfoType.IntervalTrigger,
            IntervalTicks = TimeSpan.FromHours(ResolveIntervalHours()).Ticks
        };
    }
}
