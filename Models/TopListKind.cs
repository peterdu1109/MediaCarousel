namespace JellyfinCarouselPlugin.Models;

/// <summary>
/// Nature d'un classement produit par le plugin.
/// </summary>
public enum TopListKind
{
    /// <summary>
    /// Classement calculé à partir des statistiques de lecture des utilisateurs du serveur.
    /// </summary>
    Local = 0,

    /// <summary>
    /// Classement issu d'une base de données externe (TMDB, Trakt).
    /// </summary>
    Global = 1
}
