using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Loader;
using JellyfinCarouselPlugin.Configuration;
using JellyfinCarouselPlugin.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Plugin générant, côté serveur uniquement, des classements dynamiques de médias :
/// Top du serveur d'après les statistiques de lecture, et Top mondial d'après une base externe.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    private readonly object _saveLock = new();
    private readonly ILogger<Plugin> _logger;
    private readonly IServerConfigurationManager _serverConfiguration;
    private volatile bool _configurationRead;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="Plugin"/>.
    /// </summary>
    /// <param name="applicationPaths">Les chemins de l'application.</param>
    /// <param name="xmlSerializer">Le sérialiseur XML.</param>
    /// <param name="logger">Journal.</param>
    /// <param name="serverConfiguration">Configuration du serveur, pour sa langue d'affichage.</param>
    public Plugin(
        IApplicationPaths applicationPaths,
        IXmlSerializer xmlSerializer,
        ILogger<Plugin> logger,
        IServerConfigurationManager serverConfiguration)
        : base(applicationPaths, xmlSerializer)
    {
        _logger = logger;
        _serverConfiguration = serverConfiguration;

        // Lus ici, par notre propre sérialiseur : BasePlugin ne charge donc jamais les
        // réglages lui-même, et son chargement — qui remplace par les valeurs par défaut tout
        // fichier qu'il n'arrive pas à lire — ne peut plus rien effacer. Voir ConfigurationFile.
        Configuration = ConfigurationFile.Read<PluginConfiguration>(ConfigurationFilePath, out var problem);
        _configurationRead = problem is null;

        if (problem is not null)
        {
            _logger.LogWarning(
                "Réglages illisibles ({Problem}) : valeurs par défaut en attendant, {Path} n'est pas modifié.",
                problem,
                ConfigurationFilePath);
        }

        WarnIfAnotherVersionIsLoaded();
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
    /// <remarks>
    /// Le texte de la fiche de l'extension, en français sur un serveur en français, en anglais
    /// sinon : voir <see cref="PluginDescription"/>. Relu à chaque affichage, il suit un
    /// changement de langue sans redémarrage.
    /// </remarks>
    public override string Description => PluginDescription.For(_serverConfiguration?.Configuration?.UICulture);

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

    /// <summary>
    /// Enregistre les réglages par notre sérialiseur, d'un seul coup (voir <see cref="ConfigurationFile"/>).
    /// </summary>
    /// <param name="config">Les réglages.</param>
    public override void SaveConfiguration(PluginConfiguration config)
    {
        ArgumentNullException.ThrowIfNull(config);

        lock (_saveLock)
        {
            ConfigurationFile.Write(ConfigurationFilePath, config);
        }
    }

    /// <inheritdoc />
    public override void UpdateConfiguration(BasePluginConfiguration configuration)
    {
        base.UpdateConfiguration(configuration);

        // Enregistrés depuis la page de configuration : ce sont désormais les vrais réglages.
        _configurationRead = true;
    }

    /// <summary>
    /// Enregistre les identifiants des collections créées ou retrouvées par un recalcul.
    /// </summary>
    /// <remarks>
    /// Sur les réglages COURANTS, et non sur ceux que le recalcul a lus à son départ : un
    /// enregistrement fait pendant le recalcul était sinon remplacé par les réglages
    /// précédents. Et rien n'est écrit tant que le fichier n'a pas pu être lu : ce serait
    /// remplacer les vrais réglages par ceux par défaut.
    /// </remarks>
    /// <param name="localCollectionId">Nouvel identifiant de la collection du Top du serveur, ou <c>null</c>.</param>
    /// <param name="globalCollectionId">Nouvel identifiant de la collection du Top mondial, ou <c>null</c>.</param>
    public void SaveCollectionIds(string? localCollectionId, string? globalCollectionId)
    {
        lock (_saveLock)
        {
            if (!_configurationRead)
            {
                _logger.LogWarning("Réglages illisibles : les identifiants des collections ne sont pas enregistrés.");
                return;
            }

            var configuration = Configuration;
            configuration.LocalCollectionId = localCollectionId ?? configuration.LocalCollectionId;
            configuration.GlobalCollectionId = globalCollectionId ?? configuration.GlobalCollectionId;
            SaveConfiguration(configuration);
        }
    }

    /// <summary>
    /// Signale une autre version du plugin chargée en même temps que celle-ci.
    /// </summary>
    /// <remarks>
    /// Jellyfin ne devrait en charger qu'une, mais il départage les versions installées par le
    /// NOM inscrit dans leur meta.json. Il y écrit celui du plugin dès le premier chargement,
    /// alors qu'une version tout juste installée porte celui du catalogue. Tant que les deux
    /// différaient (« Media Carousel (Jellyfin 12) »), l'ancienne version, remise « Active »
    /// par une simple lecture du catalogue, démarrait à côté de la nouvelle : 4.3.0 et 4.3.1
    /// ensemble en prod le 2026-09-29.
    /// </remarks>
    private void WarnIfAnotherVersionIsLoaded()
    {
        try
        {
            var own = typeof(Plugin).Assembly;
            var name = own.GetName().Name;
            var others = AssemblyLoadContext.All
                .SelectMany(context => context.Assemblies)
                .Where(assembly => assembly != own && string.Equals(assembly.GetName().Name, name, StringComparison.Ordinal))
                .Select(assembly => assembly.GetName().Version?.ToString() ?? "?")
                .ToList();

            if (others.Count > 0)
            {
                _logger.LogWarning(
                    "Une autre version de Media Carousel tourne en même temps ({Versions}) : redémarrez Jellyfin pour ne garder que la plus récente.",
                    string.Join(", ", others));
            }
        }
        catch (Exception ex)
        {
            // Un simple avertissement : il ne doit jamais empêcher le plugin de se charger.
            _logger.LogDebug(ex, "Impossible de vérifier les autres versions chargées.");
        }
    }
}
