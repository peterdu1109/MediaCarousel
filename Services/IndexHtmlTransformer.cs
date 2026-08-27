using System.Text.Json.Serialization;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Charge utile transmise par le plugin FileTransformation lors d'une transformation.
/// </summary>
public class FileTransformationPayload
{
    /// <summary>
    /// Obtient ou définit le contenu courant du fichier transformé.
    /// </summary>
    [JsonPropertyName("contents")]
    public string? Contents { get; set; }
}

/// <summary>
/// Callback statique invoqué par réflexion par le plugin FileTransformation pour insérer
/// la balise script dans <c>index.html</c>, sans jamais écrire sur le disque.
/// </summary>
/// <remarks>
/// Le nom complet de cette classe et celui de <see cref="InjectScript"/> sont transmis au
/// plugin FileTransformation sous forme de chaînes par
/// <see cref="JellyfinCarouselPlugin.ScheduledTasks.ScriptInjectionTask"/>. Les renommer sans
/// mettre à jour l'enregistrement casse l'intégration silencieusement — d'où l'usage de
/// <c>nameof</c> et de <c>typeof(...).FullName</c> côté appelant.
/// </remarks>
public static class IndexHtmlTransformer
{
    /// <summary>
    /// Insère la balise script juste avant la fermeture du corps du document.
    /// </summary>
    /// <param name="payload">Charge utile fournie par FileTransformation.</param>
    /// <returns>Le HTML transformé.</returns>
    public static string InjectScript(FileTransformationPayload payload)
    {
        var contents = payload?.Contents;

        if (string.IsNullOrEmpty(contents))
        {
            return contents ?? string.Empty;
        }

        return ScriptTag.Apply(contents);
    }
}
