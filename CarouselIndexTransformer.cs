namespace JellyfinCarouselPlugin;

/// <summary>
/// Callback statique invoqué par le plugin FileTransformation pour injecter le script carousel dans index.html.
/// La méthode est appelée par réflexion — ne pas renommer sans mettre à jour FileTransformationService.
/// </summary>
public static class CarouselIndexTransformer
{
    private const string ScriptTag =
        "<script src=\"/plugins/JellyfinCarouselPlugin/Web/carousel-layout.js\"></script>";

    /// <summary>
    /// Reçoit le contenu HTML de index.html et injecte la balise script carousel avant &lt;/head&gt;.
    /// Appelé par réflexion depuis le plugin FileTransformation.
    /// </summary>
    /// <param name="data">Objet JSON { "contents": "..." } passé par FileTransformation</param>
    /// <returns>HTML modifié avec le script injecté</returns>
    public static string InjectScript(object data)
    {
        // Utilise ToString() pour traverser les barrières AssemblyLoadContext en toute sécurité
        var json = data?.ToString() ?? "{}";
        var jObj = Newtonsoft.Json.Linq.JObject.Parse(json);
        var contents = jObj["contents"]?.ToString() ?? string.Empty;

        if (contents.Contains(ScriptTag))
        {
            return contents;
        }

        return contents.Replace("</head>", $"    {ScriptTag}\n</head>");
    }
}
