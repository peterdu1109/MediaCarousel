using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using JellyfinCarouselPlugin.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Plugin principal pour l'affichage en carrousel type Netflix
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="Plugin"/>
    /// </summary>
    /// <param name="applicationPaths">Les chemins de l'application</param>
    /// <param name="xmlSerializer">Le sérialiseur XML</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <inheritdoc />
    public override string Name => "Carousel Layout";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("191bd290-1054-4b55-a137-46c72181266b");

    /// <summary>
    /// Instance statique du plugin
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html"
            }
        };
    }

    /// <summary>
    /// Obtient le chemin du dossier Web contenant les ressources JavaScript et CSS
    /// </summary>
    /// <returns>Chemin absolu vers le dossier Web</returns>
    public string GetWebPath()
    {
        var assemblyLocation = Assembly.GetExecutingAssembly().Location;
        var directory = Path.GetDirectoryName(assemblyLocation);
        return directory != null ? Path.Combine(directory, "Web") : string.Empty;
    }
}
