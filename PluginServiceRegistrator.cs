using JellyfinCarouselPlugin.Providers;
using JellyfinCarouselPlugin.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Enregistre les services du plugin dans le conteneur d'injection de dépendances de Jellyfin.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        // L'instantané des classements doit survivre entre deux requêtes : singleton obligatoire.
        serviceCollection.AddSingleton<SnapshotStorage>();
        serviceCollection.AddSingleton<ITopListStore, TopListStore>();
        serviceCollection.AddSingleton<ICatalogStore, CatalogStore>();

        serviceCollection.AddSingleton<LocalTopListBuilder>();
        serviceCollection.AddSingleton<GlobalTopListBuilder>();
        serviceCollection.AddSingleton<CatalogBuilder>();
        serviceCollection.AddSingleton<LibraryRowBuilder>();
        serviceCollection.AddSingleton<CollectionSynchronizer>();
        serviceCollection.AddSingleton<TopListRefreshService>();
        serviceCollection.AddSingleton<RefreshHealth>();

        // `GetDefaultTriggers()` n'est lu qu'à la première installation de la tâche : sans ce
        // service, le réglage « intervalle de recalcul » n'avait plus aucun effet ensuite.
        serviceCollection.AddHostedService<RefreshScheduleSynchronizer>();

        // Les sources externes sont injectées en liste ; le fournisseur actif est choisi à l'exécution.
        serviceCollection.AddSingleton<ITrendingProvider, TmdbTrendingProvider>();
        serviceCollection.AddSingleton<ITrendingProvider, TraktTrendingProvider>();
    }
}
