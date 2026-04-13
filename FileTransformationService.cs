using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Service d'injection du script carousel : utilise FileTransformation plugin.
/// Exécuté en tant que tâche planifiée au démarrage pour s'assurer que FT est chargé.
/// </summary>
public class CarouselStartupTask : IScheduledTask
{
    private readonly IApplicationPaths _appPaths;
    private readonly ILogger<CarouselStartupTask> _logger;

    public string Name => "MediaCarousel Startup & Injection";
    public string Key => "Jellyfin.Plugin.MediaCarousel.Startup";
    public string Description => "Enregistre MediaCarousel auprès de FileTransformation au démarrage du serveur.";
    public string Category => "Media Carousel";

    public CarouselStartupTask(IApplicationPaths appPaths, ILogger<CarouselStartupTask> logger)
    {
        _appPaths = appPaths;
        _logger = logger;
    }

    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        try
        {
            if (!TryRegisterWithFileTransformation())
            {
                TryInjectDirectly();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MediaCarousel: Erreur fatale dans ExecuteAsync — le plugin continue sans injection.");
        }

        return Task.CompletedTask;
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        yield return new TaskTriggerInfo
        {
            Type = TaskTriggerInfoType.StartupTrigger
        };
    }

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
                ["id"] = "191bd290-1054-4b55-a137-46c72181266b", // GUID du plugin
                ["fileNamePattern"] = "index\\.html",
                ["callbackAssembly"] = typeof(CarouselStartupTask).Assembly.FullName,
                ["callbackClass"] = typeof(CarouselIndexTransformer).FullName,
                ["callbackMethod"] = nameof(CarouselIndexTransformer.InjectScript)
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
