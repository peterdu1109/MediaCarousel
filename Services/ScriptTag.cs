using System;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Manipulation de la balise script du plugin dans <c>index.html</c>.
/// Regroupée ici pour que l'injection en mémoire (FileTransformation) et l'injection
/// sur disque partagent exactement la même balise et les mêmes règles.
/// </summary>
public static class ScriptTag
{
    /// <summary>
    /// Balise insérée dans <c>index.html</c>.
    /// </summary>
    public const string Tag = "<script plugin=\"MediaCarousel\" defer=\"defer\" src=\"/MediaCarousel/media-carousel.js\"></script>";

    /// <summary>
    /// Balises des versions précédentes, retirées à la mise à jour pour ne pas laisser
    /// le navigateur demander un script qui n'existe plus.
    /// </summary>
    private static readonly string[] LegacyTags =
    {
        "<script FileTransformation=\"true\" plugin=\"MediaCarousel\" defer=\"defer\" src=\"/MediaCarousel/carousel-layout.js\"></script>",
        "<script src=\"/MediaCarousel/carousel-layout.js\"></script>",
        "<script src=\"/plugins/JellyfinCarouselPlugin/Web/carousel-layout.js\"></script>"
    };

    /// <summary>
    /// Retire les balises obsolètes puis insère la balise courante si elle est absente.
    /// L'opération est idempotente.
    /// </summary>
    /// <param name="html">Contenu de <c>index.html</c>.</param>
    /// <returns>Le contenu transformé.</returns>
    public static string Apply(string html)
    {
        html = RemoveLegacy(html);

        if (html.Contains(Tag, StringComparison.Ordinal))
        {
            return html;
        }

        var index = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);

        // Pas de </body> (fichier minifié atypique) : on se rabat sur </head>.
        if (index < 0)
        {
            index = html.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        }

        return index < 0 ? html : html.Insert(index, Tag);
    }

    /// <summary>
    /// Retire la balise courante et toutes les balises obsolètes.
    /// </summary>
    /// <param name="html">Contenu de <c>index.html</c>.</param>
    /// <returns>Le contenu transformé.</returns>
    public static string Remove(string html) => RemoveLegacy(html).Replace(Tag, string.Empty, StringComparison.Ordinal);

    private static string RemoveLegacy(string html)
    {
        foreach (var legacy in LegacyTags)
        {
            html = html.Replace(legacy, string.Empty, StringComparison.Ordinal);
        }

        return html;
    }
}
