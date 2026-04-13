using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Tâche planifiée native Jellyfin chargée de scanner les données
/// et de préparer/mettre en cache les informations pour les carrousels
/// afin de fluidifier l'expérience client.
/// </summary>
public class CarouselScanTask : IScheduledTask
{
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<CarouselScanTask> _logger;

    public string Name => "Pré-cache des Carrousels (MediaCarousel)";
    public string Key => "MediaCarousel.ScanTask";
    public string Description => "Parcourt les bibliothèques configurées pour pré-calculer et mettre en cache les données des genres et carrousels afin d'accélérer l'affichage client.";
    public string Category => "Media Carousel";

    public CarouselScanTask(ILibraryManager libraryManager, ILogger<CarouselScanTask> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
    }

    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Démarrage du scan natif des carrousels...");
        progress.Report(10);

        try
        {
            // Simulation du traitement de cache (récupération native des éléments depuis le LibraryManager)
            var items = _libraryManager.GetItemList(new MediaBrowser.Controller.Entities.InternalItemsQuery
            {
                IncludeItemTypes = new[] { "Movie", "Series" },
                IsFolder = false,
                Recursive = true
            });
            progress.Report(40);

            // TODO : Remplir un cache Singleton en mémoire qui pourra être interrogé par un nouvel Endpoint API.
            // Actuellement, la tâche valide le bon fonctionnement de l'infrastructure native d'exploitation en base de donnée.
            var allGenres = items.SelectMany(i => i.Genres).Distinct().ToList();
            
            _logger.LogInformation($"Scan terminé avec succès ! Nombre de films/séries scannés : {items.Count}. Genres uniques trouvés : {allGenres.Count}");
            progress.Report(100);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur critique durant le scan natif des carrousels.");
            throw;
        }

        return Task.CompletedTask;
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        return new[]
        {
            new TaskTriggerInfo
            {
                Type = TaskTriggerInfoType.DailyTrigger,
                TimeOfDayTicks = TimeSpan.FromHours(3).Ticks // Exécution à 3h du matin
            },
            new TaskTriggerInfo
            {
                Type = TaskTriggerInfoType.StartupTrigger // Exécution au démarrage
            }
        };
    }
}
