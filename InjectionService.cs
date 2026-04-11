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
                _logger.LogWarning("MediaCarousel: index.html introuvable. Chemins essayés : {Path1}, {Path2}, {Path3}",
                    Path.Combine(_appPaths.ProgramDataPath, "jellyfin-web", "index.html"),
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "jellyfin-web", "index.html"),
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "index.html"));
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
        string[] candidates = new[]
        {
            Path.Combine(_appPaths.ProgramDataPath, "jellyfin-web", "index.html"),
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "jellyfin-web", "index.html"),
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "index.html")
        };

        foreach (var path in candidates)
        {
            if (File.Exists(path)) return path;
        }

        return null;
    }

    /// <inheritdoc />
    public void Dispose() { }
}
