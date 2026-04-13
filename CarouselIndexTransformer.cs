using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Payload envoyé par le plugin FileTransformation.
/// </summary>
public class PatchRequestPayload
{
    /// <summary>Contenu HTML courant du fichier.</summary>
    [JsonPropertyName("contents")]
    public string? Contents { get; set; }
}

/// <summary>
/// Callback statique invoqué par le plugin FileTransformation pour injecter le script carousel dans index.html.
/// Signature calquée exactement sur EditorsChoicePlugin.Helpers.Transformations.
/// </summary>
public static class CarouselIndexTransformer
{
    /// <summary>
    /// Reçoit le contenu HTML de index.html et injecte la balise script carousel avant &lt;/body&gt;.
    /// Appelé par réflexion depuis le plugin FileTransformation.
    /// </summary>
    /// <param name="payload">Payload transféré par FileTransformation</param>
    /// <returns>HTML modifié avec le script injecté</returns>
    public static string InjectScript(PatchRequestPayload payload)
    {
        string script = "<script FileTransformation=\"true\" plugin=\"MediaCarousel\" defer=\"defer\" src=\"/MediaCarousel/carousel-layout.js\"></script>";

        string text = Regex.Replace(payload.Contents!, "(</body>)", $"{script}$1");

        return text;
    }
}
