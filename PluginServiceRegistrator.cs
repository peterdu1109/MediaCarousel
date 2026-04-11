using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Enregistre les services du plugin dans le conteneur d'injection de dépendances de Jellyfin
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        // Middleware HTTP : injecte le script même si index.html est en lecture seule
        serviceCollection.AddTransient<IStartupFilter, CarouselStartupFilter>();

        // Fallback : injection fichier si index.html est accessible en écriture
        serviceCollection.AddHostedService<InjectionService>();
    }
}
