using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Models;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Tient la présence des titres du Top mondial à jour entre deux recalculs.
/// </summary>
/// <remarks>
/// Un titre demandé via Seerr arrive dans la bibliothèque des heures avant le recalcul suivant :
/// il restait affiché absent, bouton de demande compris. Ce veilleur écoute les ajouts, mises à
/// jour et suppressions de la bibliothèque et, dès qu'un film ou une série du classement est
/// concerné, relance le seul rapprochement (<see cref="TopListRefreshService.RematchGlobal"/>),
/// sans rappeler la source externe. Le délai regroupe les rafales d'un scan de bibliothèque ; les
/// identifiants TMDB arrivent souvent par une mise à jour de métadonnées, après l'ajout.
/// </remarks>
public sealed class GlobalTopLibraryWatcher : IHostedService, IDisposable
{
    private static readonly TimeSpan Delay = TimeSpan.FromSeconds(30);

    private readonly ILibraryManager _libraryManager;
    private readonly ITopListStore _store;
    private readonly TopListRefreshService _refreshService;
    private readonly ILogger<GlobalTopLibraryWatcher> _logger;
    private readonly Timer _timer;
    private readonly object _lock = new();
    private TopListSnapshot?[] _watchedSnapshots = new TopListSnapshot?[GlobalTopKinds.All.Count];
    private HashSet<string> _absentKeys = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<Guid> _presentItems = new();

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="GlobalTopLibraryWatcher"/>.
    /// </summary>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="store">Stockage des classements.</param>
    /// <param name="refreshService">Service de recalcul.</param>
    /// <param name="logger">Journal.</param>
    public GlobalTopLibraryWatcher(
        ILibraryManager libraryManager,
        ITopListStore store,
        TopListRefreshService refreshService,
        ILogger<GlobalTopLibraryWatcher> logger)
    {
        _libraryManager = libraryManager;
        _store = store;
        _refreshService = refreshService;
        _logger = logger;
        _timer = new Timer(OnTimer, null, Timeout.Infinite, Timeout.Infinite);
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _libraryManager.ItemAdded += OnItemChanged;
        _libraryManager.ItemUpdated += OnItemChanged;
        _libraryManager.ItemRemoved += OnItemRemoved;
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        _libraryManager.ItemAdded -= OnItemChanged;
        _libraryManager.ItemUpdated -= OnItemChanged;
        _libraryManager.ItemRemoved -= OnItemRemoved;
        _timer.Change(Timeout.Infinite, Timeout.Infinite);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _timer.Dispose();
    }

    private void OnItemChanged(object? sender, ItemChangeEventArgs e)
    {
        var mediaType = e.Item switch
        {
            Movie => SeerrRules.Movie,
            Series => SeerrRules.Tv,
            _ => null
        };

        if (mediaType is null)
        {
            return;
        }

        // Appelé à chaque mise à jour d'élément, scans compris : une recherche dans un
        // ensemble, rien de plus.
        var keys = GlobalTopRematch.KeysFor(
            mediaType,
            e.Item.GetProviderId(MetadataProvider.Tmdb),
            e.Item.GetProviderId(MetadataProvider.Imdb));

        lock (_lock)
        {
            Refresh();
            foreach (var key in keys)
            {
                if (_absentKeys.Contains(key))
                {
                    Schedule(e.Item);
                    return;
                }
            }
        }
    }

    private void OnItemRemoved(object? sender, ItemChangeEventArgs e)
    {
        lock (_lock)
        {
            Refresh();
            if (_presentItems.Contains(e.Item.Id))
            {
                Schedule(e.Item);
            }
        }
    }

    /// <summary>
    /// Recalcule les ensembles surveillés quand l'une des listes du Top mondial — mêlée, ou
    /// films et séries séparés — a été republiée.
    /// </summary>
    private void Refresh()
    {
        var snapshots = new TopListSnapshot?[GlobalTopKinds.All.Count];
        var unchanged = true;

        for (var i = 0; i < snapshots.Length; i++)
        {
            snapshots[i] = _store.Get(GlobalTopKinds.All[i]);
            unchanged &= ReferenceEquals(snapshots[i], _watchedSnapshots[i]);
        }

        if (unchanged)
        {
            return;
        }

        var absent = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var present = new HashSet<Guid>();

        foreach (var snapshot in snapshots)
        {
            foreach (var entry in snapshot!.Entries)
            {
                if (entry.IsInLibrary)
                {
                    present.Add(entry.ItemId);
                }
                else if (SeerrRules.IsMediaType(entry.MediaType))
                {
                    absent.UnionWith(GlobalTopRematch.KeysFor(entry.MediaType!, entry.TmdbId, entry.ImdbId));
                }
            }
        }

        _watchedSnapshots = snapshots;
        _absentKeys = absent;
        _presentItems = present;
    }

    private void Schedule(BaseItem item)
    {
        _logger.LogDebug("Top mondial : « {Name} » a changé dans la bibliothèque, rapprochement dans {Delay}.", item.Name, Delay);
        _timer.Change(Delay, Timeout.InfiniteTimeSpan);
    }

    private void OnTimer(object? state)
    {
        // RematchGlobal consigne lui-même ses échecs : rien ne doit remonter jusqu'au minuteur.
        _refreshService.RematchGlobal();
    }
}
