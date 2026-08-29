using System;
using System.Text.RegularExpressions;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Manipulation de la balise script du plugin dans <c>index.html</c>.
/// Regroupée ici pour que l'injection en mémoire (FileTransformation) et l'injection
/// sur disque partagent exactement la même balise et les mêmes règles.
/// </summary>
public static class ScriptTag
{
    private const string ScriptPath = "/MediaCarousel/media-carousel.js";

    /// <summary>
    /// Nos balises, quel que soit le chemin de base avec lequel elles ont été écrites.
    /// </summary>
    /// <remarks>
    /// Le retrait ne peut pas se faire par égalité de chaîne. L'administrateur peut avoir
    /// changé le chemin de base du serveur entre deux démarrages : la balise déjà en place
    /// ne ressemblerait alors plus à celle que nous produirions aujourd'hui, elle resterait
    /// dans le fichier, et une seconde s'y ajouterait à chaque démarrage.
    /// </remarks>
    private static readonly Regex OwnTagPattern = new(
        "<script[^>]*plugin=\"MediaCarousel\"[^>]*>\\s*</script>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>
    /// Balises des versions 1.x et 2.x, qui pointaient un script aujourd'hui disparu.
    /// </summary>
    private static readonly Regex LegacyTagPattern = new(
        "<script[^>]*carousel-layout\\.js[^>]*>\\s*</script>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>
    /// Obtient ou définit le chemin de base du serveur, normalisé, sans barre finale.
    /// </summary>
    /// <remarks>
    /// État statique, faute de mieux : <see cref="IndexHtmlTransformer.InjectScript"/> est un
    /// rappel <b>statique</b> dont la signature est imposée par le plugin File Transformation.
    /// Il ne reçoit ni service ni contexte, et ne peut donc pas lire la configuration réseau
    /// de lui-même. <c>ScriptInjectionTask</c> renseigne cette valeur avant d'enregistrer la
    /// transformation ou d'écrire sur le disque.
    /// </remarks>
    public static string BaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Obtient la balise telle qu'elle serait insérée avec le chemin de base courant.
    /// </summary>
    public static string Tag => BuildTag(BaseUrl);

    /// <summary>
    /// Construit la balise pour un chemin de base donné.
    /// </summary>
    /// <param name="baseUrl">Le chemin de base du serveur, ou une chaîne vide.</param>
    /// <returns>La balise script complète.</returns>
    public static string BuildTag(string? baseUrl)
        => "<script plugin=\"MediaCarousel\" defer=\"defer\" src=\""
            + Normalize(baseUrl) + ScriptPath + "\"></script>";

    /// <summary>
    /// Ramène un chemin de base à la forme <c>/prefixe</c>, ou à une chaîne vide.
    /// </summary>
    /// <param name="baseUrl">La valeur brute de la configuration réseau.</param>
    /// <returns>Le préfixe utilisable tel quel devant un chemin absolu.</returns>
    public static string Normalize(string? baseUrl)
    {
        // Jellyfin accepte « jellyfin », « /jellyfin » et « /jellyfin/ » : les trois
        // désignent le même préfixe, et la configuration les enregistre telles quelles.
        var value = (baseUrl ?? string.Empty).Trim().Trim('/');

        return value.Length == 0 ? string.Empty : "/" + value;
    }

    /// <summary>
    /// Retire les balises obsolètes puis insère la balise courante si elle est absente.
    /// L'opération est idempotente.
    /// </summary>
    /// <param name="html">Contenu de <c>index.html</c>.</param>
    /// <returns>Le contenu transformé.</returns>
    public static string Apply(string html)
    {
        ArgumentNullException.ThrowIfNull(html);

        var cleaned = Remove(html);
        var index = cleaned.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);

        // Pas de </body> (fichier minifié atypique) : on se rabat sur </head>.
        if (index < 0)
        {
            index = cleaned.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        }

        // Aucun point d'ancrage : le fichier est rendu tel qu'il est arrivé, balises
        // comprises, plutôt que renvoyé amputé de la nôtre sans l'avoir remplacée.
        return index < 0 ? html : cleaned.Insert(index, Tag);
    }

    /// <summary>
    /// Retire la balise courante et toutes les balises obsolètes.
    /// </summary>
    /// <param name="html">Contenu de <c>index.html</c>.</param>
    /// <returns>Le contenu transformé.</returns>
    public static string Remove(string html)
    {
        ArgumentNullException.ThrowIfNull(html);

        return LegacyTagPattern.Replace(OwnTagPattern.Replace(html, string.Empty), string.Empty);
    }
}
