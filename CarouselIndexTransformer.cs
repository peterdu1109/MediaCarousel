using System.Text.Json.Serialization;

namespace JellyfinCarouselPlugin;

public class PatchRequestPayload
{
    [JsonPropertyName("contents")]
    public string Contents { get; set; }
}

/// <summary>
/// Callback statique invoqué par le plugin FileTransformation pour injecter le script carousel dans index.html.
/// La méthode est appelée par réflexion — ne pas renommer sans mettre à jour FileTransformationService.
/// </summary>
public static class CarouselIndexTransformer
{
    private const string ScriptTag =
        "<script src=\"/MediaCarousel/carousel-layout.js\"></script>";
    private const string OldScriptTag = 
        "<script src=\"/plugins/JellyfinCarouselPlugin/Web/carousel-layout.js\"></script>";

    /// <summary>
    /// Reçoit le contenu HTML de index.html et injecte la balise script carousel avant &lt;/head&gt;.
    /// Appelé par réflexion depuis le plugin FileTransformation.
    /// </summary>
    /// </summary>
    /// <param name="payload">Payload transféré par FileTransformation</param>
    /// <returns>HTML modifié avec le script injecté</returns>
    public static string InjectScript(PatchRequestPayload payload)
    {
        try
        {
            string contents = payload?.Contents ?? string.Empty;
            if (string.IsNullOrEmpty(contents) || contents.Contains(ScriptTag))
            {
                return contents;
            }

            if (contents.Contains(OldScriptTag)) 
            {
                contents = contents.Replace(OldScriptTag, "");
            }

            return contents.Replace("</head>", $"    {ScriptTag}\n</head>");
        }
        catch
        {
            // En cas d'erreur inattendue
            return string.Empty;
        }
    }
}
