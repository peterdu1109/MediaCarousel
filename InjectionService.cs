using System;
using System.IO;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Service d'injection du script carousel dans l'interface web Jellyfin au démarrage
/// </summary>
public class InjectionService : IServerEntryPoint
{
    private readonly IApplicationPaths _appPaths;
    private readonly ILogger<InjectionService> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de <see cref="InjectionService"/>
    /// </summary>
    public InjectionService(IApplicationPaths appPaths, ILogger<InjectionService> logger)
    {
        _appPaths = appPaths;
        _logger = logger;
    }

    /// <inheritdoc />
    public void Run()
    {
        try
        {
            var indexFile = FindIndexHtml();

            if (indexFile == null)
            {
                _logger.LogWarning("MediaCarousel: index.html introuvable. Chemins essayés : WebPath={WebPath}, ProgramData={ProgramData}, BaseDir={BaseDir}",
                    _appPaths.WebPath,
                    Path.Combine(_appPaths.ProgramDataPath, "jellyfin-web"),
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "jellyfin-web"));
                return;
            }

            var content = File.ReadAllText(indexFile);
            const string injectionTag = "<script src=\"/plugins/JellyfinCarouselPlugin/Web/carousel-layout.js\"></script>";

            if (!content.Contains(injectionTag))
            {
                content = content.Replace("</head>", $"    {injectionTag}\n</head>");
                File.WriteAllText(indexFile, content);
                _logger.LogInformation("MediaCarousel: Script injecté avec succès dans {Path}", indexFile);
            }
            else
            {
                _logger.LogInformation("MediaCarousel: Script déjà présent dans {Path}", indexFile);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MediaCarousel: Échec de l'injection dans index.html.");
        }
    }

    private string? FindIndexHtml()
    {
        // Priorité 1 : WebPath — chemin officiel Jellyfin vers les fichiers web
        var candidate = Path.Combine(_appPaths.WebPath, "index.html");
        if (File.Exists(candidate)) return candidate;

        // Priorité 2 : jellyfin-web dans ProgramDataPath
        candidate = Path.Combine(_appPaths.ProgramDataPath, "jellyfin-web", "index.html");
        if (File.Exists(candidate)) return candidate;

        // Priorité 3 : jellyfin-web dans le répertoire de base
        candidate = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "jellyfin-web", "index.html");
        if (File.Exists(candidate)) return candidate;

        // Priorité 4 : web/ dans le répertoire de base (certaines installations Linux)
        candidate = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "index.html");
        if (File.Exists(candidate)) return candidate;

        return null;
    }

    /// <inheritdoc />
    public void Dispose() { }
}
