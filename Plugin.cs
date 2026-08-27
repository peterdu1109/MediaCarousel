using System;
using System.Collections.Generic;
using JellyfinCarouselPlugin.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Plugin générant, côté serveur uniquement, des classements dynamiques de médias :
/// Top du serveur d'après les statistiques de lecture, et Top mondial d'après une base externe.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="Plugin"/>.
    /// </summary>
    /// <param name="applicationPaths">Les chemins de l'application.</param>
    /// <param name="xmlSerializer">Le sérialiseur XML.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <summary>
    /// Obtient l'instance courante du plugin.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public override string Name => "Media Carousel";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("191bd290-1054-4b55-a137-46c72181266b");

    /// <inheritdoc />
    public override string Description =>
        "Génère automatiquement un Top du serveur à partir des statistiques de lecture et un Top mondial à partir de TMDB ou Trakt.";

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html",
                EnableInMainMenu = true,
                MenuIcon = "leaderboard"
            }
        };
    }
}
