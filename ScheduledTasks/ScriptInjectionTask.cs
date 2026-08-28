using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.ScheduledTasks;

/// <summary>
/// Rend les rangées visibles sur la page d'accueil en insérant la balise script du plugin
/// dans <c>index.html</c>, automatiquement, sans intervention de l'administrateur.
/// </summary>
/// <remarks>
/// Deux stratégies, dans l'ordre :
/// <list type="number">
/// <item>le plugin <c>File Transformation</c> s'il est installé — la transformation est
/// appliquée en mémoire, rien n'est écrit sur le disque et une mise à jour de Jellyfin
/// ne défait rien ;</item>
/// <item>à défaut, une modification directe et idempotente de <c>index.html</c>.</item>
/// </list>
/// Dans les deux cas, les balises des versions précédentes du plugin sont retirées.
/// </remarks>
public sealed class ScriptInjectionTask : IScheduledTask
{
    private const string PluginId = "191bd290-1054-4b55-a137-46c72181266b";

    private readonly IApplicationPaths _applicationPaths;
    private readonly ILogger<ScriptInjectionTask> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="ScriptInjectionTask"/>.
    /// </summary>
    /// <param name="applicationPaths">Chemins de l'application.</param>
    /// <param name="logger">Journal.</param>
    public ScriptInjectionTask(IApplicationPaths applicationPaths, ILogger<ScriptInjectionTask> logger)
    {
        _applicationPaths = applicationPaths;
        _logger = logger;
    }

    /// <inheritdoc />
    public string Name => "Intégration de MediaCarousel à la page d'accueil";

    /// <inheritdoc />
    public string Key => "MediaCarousel.ScriptInjection";

    /// <inheritdoc />
    public string Description => "Insère le script d'affichage des rangées Top 10 dans l'interface web de Jellyfin.";

    /// <inheritdoc />
    public string Category => "MediaCarousel";

    /// <inheritdoc />
    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        try
        {
            var enabled = Plugin.Instance?.Configuration.EnableHomeRows ?? true;

            if (!enabled)
            {
                RemoveFromDisk();
                return Task.CompletedTask;
            }

            if (!TryRegisterWithFileTransformation())
            {
                InjectIntoDisk();
            }
        }
        catch (Exception ex)
        {
            // L'échec de l'intégration ne doit jamais empêcher le reste du plugin de fonctionner.
            _logger.LogError(ex, "Intégration à la page d'accueil impossible ; les classements restent accessibles via l'API.");
        }

        progress?.Report(100);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        yield return new TaskTriggerInfo
        {
            Type = TaskTriggerInfoType.StartupTrigger
        };
    }

    /// <summary>
    /// Enregistre la transformation auprès du plugin FileTransformation, s'il est présent.
    /// </summary>
    /// <returns><c>true</c> si l'enregistrement a réussi.</returns>
    private bool TryRegisterWithFileTransformation()
    {
        var assembly = FindFileTransformationAssembly();

        if (assembly is null)
        {
            _logger.LogInformation("Plugin File Transformation absent : modification directe de index.html.");
            return false;
        }

        var interfaceType = assembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
        var registerMethod = interfaceType?.GetMethod("RegisterTransformation", BindingFlags.Public | BindingFlags.Static);

        if (registerMethod is null)
        {
            _logger.LogWarning("RegisterTransformation introuvable dans File Transformation : modification directe de index.html.");
            return false;
        }

        var parameters = registerMethod.GetParameters();
        if (parameters.Length != 1)
        {
            _logger.LogWarning("Signature inattendue de RegisterTransformation : modification directe de index.html.");
            return false;
        }

        var payload = BuildPayload(parameters[0].ParameterType);
        if (payload is null)
        {
            return false;
        }

        registerMethod.Invoke(null, new[] { payload });
        _logger.LogInformation("Transformation enregistrée auprès du plugin File Transformation.");
        return true;
    }

    /// <summary>
    /// Construit la charge utile attendue par FileTransformation.
    /// </summary>
    /// <remarks>
    /// Le type de la charge utile provient de l'assembly de FileTransformation elle-même
    /// (<c>JObject</c> de sa propre version de Newtonsoft.Json). Le construire par réflexion
    /// évite d'ajouter une dépendance dont la version pourrait diverger à l'exécution.
    /// </remarks>
    private object? BuildPayload(Type payloadType)
    {
        var parse = payloadType.GetMethod("Parse", BindingFlags.Public | BindingFlags.Static, new[] { typeof(string) });

        if (parse is null)
        {
            _logger.LogWarning("Type de charge utile inattendu ({Type}) : modification directe de index.html.", payloadType.FullName);
            return null;
        }

        var json = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["id"] = PluginId,
            ["fileNamePattern"] = "index.html",
            ["callbackAssembly"] = typeof(IndexHtmlTransformer).Assembly.FullName ?? string.Empty,
            ["callbackClass"] = typeof(IndexHtmlTransformer).FullName ?? string.Empty,
            ["callbackMethod"] = nameof(IndexHtmlTransformer.InjectScript)
        });

        return parse.Invoke(null, new object[] { json });
    }

    private static Assembly? FindFileTransformationAssembly()
    {
        return AssemblyLoadContext.All
            .SelectMany(SafeAssemblies)
            .FirstOrDefault(a => a.FullName?.Contains("FileTransformation", StringComparison.OrdinalIgnoreCase) == true);

        static IEnumerable<Assembly> SafeAssemblies(AssemblyLoadContext context)
        {
            try
            {
                return context.Assemblies;
            }
            catch (Exception)
            {
                // Un contexte peut être en cours de déchargement : on l'ignore.
                return Array.Empty<Assembly>();
            }
        }
    }

    private void InjectIntoDisk() => UpdateIndexHtml(ScriptTag.Apply, "Script inséré dans {Path}.");

    private void RemoveFromDisk() => UpdateIndexHtml(ScriptTag.Remove, "Script retiré de {Path}.");

    private void UpdateIndexHtml(Func<string, string> transform, string successMessage)
    {
        var path = FindIndexHtml();

        if (path is null)
        {
            _logger.LogWarning("index.html introuvable : les rangées ne seront pas affichées sur la page d'accueil.");
            return;
        }

        try
        {
            var original = File.ReadAllText(path);
            var updated = transform(original);

            if (string.Equals(original, updated, StringComparison.Ordinal))
            {
                _logger.LogDebug("index.html déjà à jour.");
                return;
            }

            // index.html est le point d'entrée de toute l'interface web : une coupure pendant
            // l'écriture le laisserait tronqué et Jellyfin ne chargerait plus du tout. Le fichier
            // temporaire est créé dans le même répertoire pour que le remplacement soit atomique.
            var temporary = path + ".mediacarousel.tmp";
            File.WriteAllText(temporary, updated);
            File.Move(temporary, path, overwrite: true);
#pragma warning disable CA2254 // Le message est un littéral choisi par l'appelant, pas une interpolation.
            _logger.LogInformation(successMessage, path);
#pragma warning restore CA2254
        }
        catch (UnauthorizedAccessException)
        {
            _logger.LogWarning(
                "Accès refusé à {Path}. Installez le plugin « File Transformation » pour intégrer les rangées sans écrire sur le disque.",
                path);
        }
        catch (IOException ex)
        {
            // Le remplacement a échoué : index.html reste dans son état d'origine.
            _logger.LogWarning(ex, "Écriture de {Path} impossible ; le fichier est inchangé.", path);
        }
    }

    private string? FindIndexHtml()
    {
        var candidates = new[]
        {
            Path.Combine(_applicationPaths.WebPath, "index.html"),
            Path.Combine(_applicationPaths.ProgramDataPath, "jellyfin-web", "index.html"),
            Path.Combine(AppContext.BaseDirectory, "jellyfin-web", "index.html"),
            Path.Combine(AppContext.BaseDirectory, "web", "index.html")
        };

        return candidates.FirstOrDefault(File.Exists);
    }
}
