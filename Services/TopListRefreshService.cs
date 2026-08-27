using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Configuration;
using JellyfinCarouselPlugin.Models;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Orchestre le recalcul des classements : Top local, Top global, puis synchronisation
/// des collections. Point d'entrée unique de la tâche planifiée et du rafraîchissement manuel.
/// </summary>
public sealed class TopListRefreshService
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly LocalTopListBuilder _localBuilder;
    private readonly GlobalTopListBuilder _globalBuilder;
    private readonly CatalogBuilder _catalogBuilder;
    private readonly CollectionSynchronizer _collectionSynchronizer;
    private readonly ITopListStore _store;
    private readonly ICatalogStore _catalogStore;
    private readonly ILogger<TopListRefreshService> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TopListRefreshService"/>.
    /// </summary>
    /// <param name="localBuilder">Calculateur du Top local.</param>
    /// <param name="globalBuilder">Calculateur du Top global.</param>
    /// <param name="catalogBuilder">Agrégateur des studios et des genres.</param>
    /// <param name="collectionSynchronizer">Synchroniseur de collections.</param>
    /// <param name="store">Stockage des classements.</param>
    /// <param name="catalogStore">Stockage des catalogues.</param>
    /// <param name="logger">Journal.</param>
    public TopListRefreshService(
        LocalTopListBuilder localBuilder,
        GlobalTopListBuilder globalBuilder,
        CatalogBuilder catalogBuilder,
        CollectionSynchronizer collectionSynchronizer,
        ITopListStore store,
        ICatalogStore catalogStore,
        ILogger<TopListRefreshService> logger)
    {
        _localBuilder = localBuilder;
        _globalBuilder = globalBuilder;
        _catalogBuilder = catalogBuilder;
        _collectionSynchronizer = collectionSynchronizer;
        _store = store;
        _catalogStore = catalogStore;
        _logger = logger;
    }

    /// <summary>
    /// Recalcule les classements activés.
    /// </summary>
    /// <remarks>
    /// Les deux classements sont indépendants : l'échec de la source externe ne doit pas
    /// invalider le Top local, et inversement. En cas d'échec, l'instantané précédent est conservé,
    /// ce qui évite qu'une coupure réseau vide la liste côté client.
    /// </remarks>
    /// <param name="progress">Rapport d'avancement, ou <c>null</c>.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Une tâche représentant l'opération.</returns>
    public async Task RefreshAsync(IProgress<double>? progress, CancellationToken cancellationToken)
    {
        var plugin = Plugin.Instance;
        if (plugin is null)
        {
            _logger.LogWarning("Plugin non initialisé : rafraîchissement ignoré.");
            return;
        }

        // Un seul recalcul à la fois : la tâche planifiée et l'appel manuel partagent ce verrou.
        if (!await _gate.WaitAsync(TimeSpan.Zero, cancellationToken).ConfigureAwait(false))
        {
            _logger.LogInformation("Un rafraîchissement est déjà en cours, celui-ci est ignoré.");
            return;
        }

        try
        {
            var config = plugin.Configuration;
            var configurationChanged = false;

            progress?.Report(0);

            if (config.EnableLocalTop)
            {
                configurationChanged |= await RefreshLocalAsync(config, cancellationToken).ConfigureAwait(false);
            }

            progress?.Report(40);

            if (config.EnableGlobalTop)
            {
                configurationChanged |= await RefreshGlobalAsync(config, cancellationToken).ConfigureAwait(false);
            }

            progress?.Report(75);

            RefreshCatalogs(config, cancellationToken);

            if (configurationChanged)
            {
                plugin.UpdateConfiguration(config);
            }

            progress?.Report(100);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Agrège les studios et les genres. Ces catalogues ne dépendent d'aucune source externe
    /// et sont peu coûteux : leur échec est isolé de celui des classements.
    /// </summary>
    private void RefreshCatalogs(PluginConfiguration config, CancellationToken cancellationToken)
    {
        try
        {
            if (config.EnableStudioRow)
            {
                _catalogStore.Publish(_catalogBuilder.BuildStudios(
                    config.StudioRowSize,
                    config.MinItemsPerStudio,
                    cancellationToken));
            }

            if (config.EnableGenreRows)
            {
                _catalogStore.Publish(_catalogBuilder.BuildGenres(
                    config.GenreRowCount,
                    config.MinItemsPerGenre,
                    cancellationToken));
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Échec de l'agrégation des catalogues ; les précédents sont conservés.");
        }
    }

    private async Task<bool> RefreshLocalAsync(PluginConfiguration config, CancellationToken cancellationToken)
    {
        try
        {
            var snapshot = _localBuilder.Build(config, cancellationToken);
            _store.Publish(snapshot);

            if (config.SyncCollections)
            {
                var id = await _collectionSynchronizer.SyncAsync(
                    snapshot,
                    config.LocalCollectionName,
                    ParseGuid(config.LocalCollectionId),
                    cancellationToken).ConfigureAwait(false);

                return TryStoreCollectionId(id, config.LocalCollectionId, value => config.LocalCollectionId = value);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Échec du calcul du Top local ; l'instantané précédent est conservé.");
        }

        return false;
    }

    private async Task<bool> RefreshGlobalAsync(PluginConfiguration config, CancellationToken cancellationToken)
    {
        try
        {
            var snapshot = await _globalBuilder.BuildAsync(config, cancellationToken).ConfigureAwait(false);
            _store.Publish(snapshot);

            if (config.SyncCollections)
            {
                var id = await _collectionSynchronizer.SyncAsync(
                    snapshot,
                    config.GlobalCollectionName,
                    ParseGuid(config.GlobalCollectionId),
                    cancellationToken).ConfigureAwait(false);

                return TryStoreCollectionId(id, config.GlobalCollectionId, value => config.GlobalCollectionId = value);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Échec de la récupération du Top global ; l'instantané précédent est conservé.");
        }

        return false;
    }

    private static bool TryStoreCollectionId(Guid id, string? current, Action<string> setter)
    {
        if (id == Guid.Empty)
        {
            return false;
        }

        var value = id.ToString("N", CultureInfo.InvariantCulture);
        if (string.Equals(current, value, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        setter(value);
        return true;
    }

    private static Guid ParseGuid(string? value)
        => Guid.TryParse(value, CultureInfo.InvariantCulture, out var guid) ? guid : Guid.Empty;
}
