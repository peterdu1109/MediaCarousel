using System;
using System.IO;
using System.Linq;
using System.Runtime.Loader;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Service d'injection du script carousel : utilise FileTransformation plugin si disponible,
/// sinon injection directe dans index.html en fallback.
/// </summary>
public class FileTransformationService : IHostedService
{
    private readonly IApplicationPaths _appPaths;
    private readonly ILogger<FileTransformationService> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de <see cref="FileTransformationService"/>
    /// </summary>
    public FileTransformationService(IApplicationPaths appPaths, ILogger<FileTransformationService> logger)
    {
        _appPaths = appPaths;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        // Encapsulation totale : ne JAMAIS laisser une exception remonter
        // car cela détruit le conteneur DI de Jellyfin (ObjectDisposedException)
        try
        {
            if (!TryRegisterWithFileTransformation())
            {
                TryInjectDirectly();
            }
        }
        catch (Exception ex)
        {
            // Log uniquement — ne jamais propager l'exception
            try
            {
                _logger.LogError(ex, "MediaCarousel: Erreur fatale dans StartAsync — le plugin continue sans injection.");
            }
            catch
            {
                // Si même le logger est cassé, ne rien faire
            }
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private bool TryRegisterWithFileTransformation()
    {
        try
        {
            var ftAssembly = AssemblyLoadContext.All
                .SelectMany(ctx =>
                {
                    try { return ctx.Assemblies; }
                    catch { return Enumerable.Empty<System.Reflection.Assembly>(); }
                })
                .FirstOrDefault(a =>
                {
                    try { return a.FullName?.Contains("FileTransformation", StringComparison.OrdinalIgnoreCase) ?? false; }
                    catch { return false; }
                });

            if (ftAssembly == null)
            {
                _logger.LogInformation("MediaCarousel: Plugin FileTransformation non trouvé, utilisation de l'injection directe.");
                return false;
            }

            var interfaceType = ftAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            var registerMethod = interfaceType?.GetMethod("RegisterTransformation");

            if (registerMethod == null)
            {
                _logger.LogWarning("MediaCarousel: RegisterTransformation introuvable dans FileTransformation.");
                return false;
            }

            var payload = new JObject
            {
                ["id"] = "c391d6f2-1a2b-4a3c-8d4e-5f6a7b8c9d0e",
                ["fileNamePattern"] = "index\\.html",
                ["callbackAssembly"] = GetType().Assembly.FullName,
                ["callbackClass"] = "JellyfinCarouselPlugin.CarouselIndexTransformer",
                ["callbackMethod"] = "InjectScript"
            };

            registerMethod.Invoke(null, new object[] { payload });
            _logger.LogInformation("MediaCarousel: Transformation enregistrée via FileTransformation plugin.");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MediaCarousel: Erreur lors de l'enregistrement avec FileTransformation.");
            return false;
        }
    }

    private void TryInjectDirectly()
    {
        try
        {
            string[] candidates =
            {
                Path.Combine(_appPaths.WebPath, "index.html"),
                Path.Combine(_appPaths.ProgramDataPath, "jellyfin-web", "index.html"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "jellyfin-web", "index.html"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "index.html")
            };

            var indexFile = candidates.FirstOrDefault(File.Exists);
            if (indexFile == null)
            {
                _logger.LogWarning("MediaCarousel: index.html introuvable dans les chemins standard.");
                return;
            }

            var content = File.ReadAllText(indexFile);
            const string tag = "<script src=\"/MediaCarousel/carousel-layout.js\"></script>";

            if (content.Contains(tag))
            {
                _logger.LogInformation("MediaCarousel: Script déjà présent dans {Path}", indexFile);
                return;
            }

            // Au cas où l'ancienne version était installée, la nettoyer
            const string oldTag = "<script src=\"/plugins/JellyfinCarouselPlugin/Web/carousel-layout.js\"></script>";
            if (content.Contains(oldTag))
            {
                content = content.Replace(oldTag, "");
            }

            // Injection sans ajout de newline (compatibilité fichiers minifiés)
            content = content.Replace("</head>", tag + "</head>");
            File.WriteAllText(indexFile, content);
            _logger.LogInformation("MediaCarousel: Script injecté dans {Path}", indexFile);
        }
        catch (UnauthorizedAccessException)
        {
            _logger.LogWarning("MediaCarousel: Accès refusé à index.html. Installez le plugin 'File Transformation' pour résoudre ce problème.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MediaCarousel: Échec de l'injection directe.");
        }
    }
}
