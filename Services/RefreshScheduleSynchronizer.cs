using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.ScheduledTasks;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Répercute le réglage « intervalle de recalcul » sur le déclencheur de la tâche planifiée.
/// </summary>
/// <remarks>
/// <para>
/// Sans cela, le réglage ne servait à rien. <c>IScheduledTask.GetDefaultTriggers()</c> n'est
/// consulté par Jellyfin que lorsque la tâche n'a encore aucun déclencheur enregistré,
/// c'est-à-dire à sa toute première installation. Le calendrier vit ensuite dans la
/// configuration des tâches de Jellyfin, et plus rien ne le relisait : un administrateur
/// pouvait passer le champ de 6 à 24 heures, l'enregistrer, et voir le serveur continuer à
/// recalculer toutes les six heures sans le moindre message.
/// </para>
/// <para>
/// Seul le déclencheur d'INTERVALLE est réécrit. Les autres — démarrage, quotidien,
/// hebdomadaire — sont conservés tels quels : un administrateur qui ajoute un passage à
/// quatre heures du matin depuis Tableau de bord → Tâches planifiées le garde. Ce service ne
/// possède que la périodicité, pas tout le calendrier.
/// </para>
/// </remarks>
public sealed class RefreshScheduleSynchronizer : IHostedService
{
    private readonly ITaskManager _taskManager;
    private readonly ILogger<RefreshScheduleSynchronizer> _logger;
    private EventHandler<BasePluginConfiguration>? _handler;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="RefreshScheduleSynchronizer"/>.
    /// </summary>
    /// <param name="taskManager">Gestionnaire des tâches planifiées.</param>
    /// <param name="logger">Journal.</param>
    public RefreshScheduleSynchronizer(
        ITaskManager taskManager,
        ILogger<RefreshScheduleSynchronizer> logger)
    {
        _taskManager = taskManager;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var plugin = Plugin.Instance;

        if (plugin is null)
        {
            return Task.CompletedTask;
        }

        // Au démarrage aussi : c'est ce qui rattrape les installations existantes, dont le
        // déclencheur porte encore la valeur figée à la première installation.
        Apply();

        _handler = (_, _) => Apply();
        plugin.ConfigurationChanged += _handler;

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        if (_handler is not null && Plugin.Instance is not null)
        {
            Plugin.Instance.ConfigurationChanged -= _handler;
            _handler = null;
        }

        return Task.CompletedTask;
    }

    private void Apply()
    {
        try
        {
            var worker = _taskManager.ScheduledTasks
                .FirstOrDefault(w => w.ScheduledTask is TopListRefreshTask);

            if (worker is null)
            {
                _logger.LogWarning("Tâche de recalcul introuvable : l'intervalle n'a pas pu être appliqué.");
                return;
            }

            var hours = TopListRefreshTask.ResolveIntervalHours();
            var ticks = TimeSpan.FromHours(hours).Ticks;
            var triggers = worker.Triggers;

            var interval = triggers.FirstOrDefault(t => t.Type == TaskTriggerInfoType.IntervalTrigger);

            if (interval is not null && interval.IntervalTicks == ticks)
            {
                return;
            }

            // Les autres déclencheurs sont recopiés à l'identique ; seul celui d'intervalle
            // est remplacé, ou ajouté s'il n'y en avait aucun.
            var updated = new List<TaskTriggerInfo>(
                triggers.Where(t => t.Type != TaskTriggerInfoType.IntervalTrigger))
            {
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.IntervalTrigger,
                    IntervalTicks = ticks
                }
            };

            worker.Triggers = updated;

            _logger.LogInformation(
                "Intervalle de recalcul appliqué : toutes les {Hours} heure(s).",
                hours);
        }
        catch (Exception ex)
        {
            // Un calendrier qu'on n'arrive pas à écrire ne doit pas empêcher le serveur de
            // démarrer : la tâche garde alors son ancien déclencheur.
            _logger.LogError(ex, "Impossible d'appliquer l'intervalle de recalcul.");
        }
    }
}
