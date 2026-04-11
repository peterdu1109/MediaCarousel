using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Service d'injection du script carousel dans l'interface web Jellyfin au démarrage
/// </summary>
public class InjectionService : IHostedService
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
    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            var indexFile = FindIndexHtml();

            if (indexFile == null)
            {
                _logger.LogWarning("MediaCarousel: index.html introuvable. Chemins essayés : {Path1}, {Path2}, {Path3}, {Path4}",
                    Path.Combine(_appPaths.WebPath, "index.html"),
                    Path.Combine(_appPaths.ProgramDataPath, "jellyfin-web", "index.html"),
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "jellyfin-web", "index.html"),
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "index.html"));
                return Task.CompletedTask;
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
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning(ex, "MediaCarousel: Accès refusé à index.html. Le plugin fonctionnera en mode chargement manuel.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MediaCarousel: Échec de l'injection dans index.html.");
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private string? FindIndexHtml()
    {
        string[] candidates = new[]
        {
            Path.Combine(_appPaths.WebPath, "index.html"),
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
}
