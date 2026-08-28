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
    private readonly LibraryRowBuilder _libraryRowBuilder;
    private readonly CollectionSynchronizer _collectionSynchronizer;
    private readonly ITopListStore _store;
    private readonly ICatalogStore _catalogStore;
    private readonly RefreshHealth _health;
    private readonly ILogger<TopListRefreshService> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TopListRefreshService"/>.
    /// </summary>
    /// <param name="localBuilder">Calculateur du Top local.</param>
    /// <param name="globalBuilder">Calculateur du Top global.</param>
    /// <param name="catalogBuilder">Agrégateur des studios et des genres.</param>
    /// <param name="libraryRowBuilder">Constructeur des rangées dérivées de la bibliothèque.</param>
    /// <param name="collectionSynchronizer">Synchroniseur de collections.</param>
    /// <param name="store">Stockage des classements.</param>
    /// <param name="catalogStore">Stockage des catalogues.</param>
    /// <param name="health">Bilan du dernier recalcul.</param>
    /// <param name="logger">Journal.</param>
    public TopListRefreshService(
        LocalTopListBuilder localBuilder,
        GlobalTopListBuilder globalBuilder,
        CatalogBuilder catalogBuilder,
        LibraryRowBuilder libraryRowBuilder,
        CollectionSynchronizer collectionSynchronizer,
        ITopListStore store,
        ICatalogStore catalogStore,
        RefreshHealth health,
        ILogger<TopListRefreshService> logger)
    {
        _localBuilder = localBuilder;
        _globalBuilder = globalBuilder;
        _catalogBuilder = catalogBuilder;
        _libraryRowBuilder = libraryRowBuilder;
        _collectionSynchronizer = collectionSynchronizer;
        _store = store;
        _catalogStore = catalogStore;
        _health = health;
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

        // Le bilan couvre tout le passage : chaque échec rattrapé plus bas y est consigné,
        // sans quoi la tolérance aux pannes rendrait les erreurs invisibles.
        _health.BeginRun();

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

            progress?.Report(65);

            RefreshLibraryRows(config, cancellationToken);

            progress?.Report(85);

            RefreshCatalogs(config, cancellationToken);

            PurgePosterCache();

            if (configurationChanged)
            {
                plugin.UpdateConfiguration(config);
            }

            progress?.Report(100);
        }
        finally
        {
            _health.EndRun();
            _gate.Release();
        }
    }

    /// <summary>
    /// Construit les rangées dérivées de la bibliothèque. Elles ne dépendent d'aucune source
    /// externe : leur échec est isolé de celui des classements.
    /// </summary>
    private void RefreshLibraryRows(PluginConfiguration config, CancellationToken cancellationToken)
    {
        if (config.EnableNeverPlayedRow)
        {
            TryPublish(() => _libraryRowBuilder.BuildNeverPlayed(config, cancellationToken), "jamais vu", cancellationToken);
        }

        if (config.EnableReturningRow)
        {
            TryPublish(() => _libraryRowBuilder.BuildReturningSeries(config, cancellationToken), "de retour", cancellationToken);
        }
    }

    private void TryPublish(Func<Models.TopListSnapshot> build, string label, CancellationToken cancellationToken)
    {
        try
        {
            _store.Publish(build());
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _health.RecordFailure(label, ex);
            _logger.LogError(ex, "Échec du calcul de la rangée « {Label} » ; la précédente est conservée.", label);
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
            if (!config.EnableStudioRow && !config.EnableGenreRows)
            {
                return;
            }

            // Les deux catalogues se comptent sur les mêmes titres : un seul balayage les produit.
            var (studios, genres) = _catalogBuilder.Build(config, cancellationToken);

            if (config.EnableStudioRow)
            {
                _catalogStore.Publish(studios);
            }

            if (config.EnableGenreRows)
            {
                _catalogStore.Publish(genres);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _health.RecordFailure("studios et genres", ex);
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
            _health.RecordFailure("Top du serveur", ex);
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
            _health.RecordFailure("Top mondial", ex);
            _logger.LogError(ex, "Échec de la récupération du Top global ; l'instantané précédent est conservé.");
        }

        return false;
    }

    /// <summary>
    /// Purge les affiches en cache que plus personne ne demande.
    /// </summary>
    /// <remarks>
    /// Sans cela, le dossier <c>posters/</c> grossit sans limite : chaque affiche TMDB
    /// téléchargée y reste pour toujours, alors que le Top mondial en change à chaque
    /// tendance. <see cref="Api.PosterController"/> touche la date d'accès à chaque service
    /// — les systèmes montés en <c>noatime</c> ne la maintiennent pas d'eux-mêmes — et une
    /// affiche supprimée à tort se retélécharge simplement à la prochaine requête.
    /// </remarks>
    private void PurgePosterCache()
    {
        try
        {
            var folder = Plugin.Instance?.DataFolderPath;
            if (string.IsNullOrEmpty(folder))
            {
                return;
            }

            var posters = System.IO.Path.Combine(folder, "posters");
            if (!System.IO.Directory.Exists(posters))
            {
                return;
            }

            var cutoff = DateTime.UtcNow.AddDays(-30);
            var removed = 0;

            foreach (var file in System.IO.Directory.EnumerateFiles(posters))
            {
                if (System.IO.File.GetLastAccessTimeUtc(file) < cutoff)
                {
                    System.IO.File.Delete(file);
                    removed++;
                }
            }

            if (removed > 0)
            {
                _logger.LogInformation("Cache d'affiches purgé : {Count} fichier(s) supprimé(s).", removed);
            }
        }
        catch (Exception ex)
        {
            // Un cache qui ne se purge pas n'est pas une panne du recalcul.
            _logger.LogDebug(ex, "Échec de la purge du cache d'affiches.");
        }
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
