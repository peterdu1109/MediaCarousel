namespace JellyfinCarouselPlugin;

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
    /// <param name="data">Objet JSON { "contents": "..." } ou contenu HTML brut passé par FileTransformation</param>
    /// <returns>HTML modifié avec le script injecté, ou contenu original en cas d'erreur</returns>
    public static string InjectScript(object data)
    {
        try
        {
            var raw = data?.ToString() ?? string.Empty;
            if (string.IsNullOrEmpty(raw))
            {
                return raw;
            }

            // Essayer de parser comme JSON { "contents": "..." }
            string contents;
            try
            {
                var jObj = Newtonsoft.Json.Linq.JObject.Parse(raw);
                contents = jObj["contents"]?.ToString() ?? string.Empty;
            }
            catch
            {
                // Si ce n'est pas du JSON, traiter comme du HTML brut
                contents = raw;
            }

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
            // En cas d'erreur inattendue, retourner le contenu original pour ne pas casser Jellyfin
            return data?.ToString() ?? string.Empty;
        }
    }
}
