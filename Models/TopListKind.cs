namespace JellyfinCarouselPlugin.Models;

/// <summary>
/// Nature d'une liste de titres produite par le plugin.
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
    Global = 1,

    /// <summary>
    /// Films bien notés que personne n'a encore lancés sur le serveur.
    /// </summary>
    NeverPlayed = 2,

    /// <summary>
    /// Séries dont des épisodes viennent d'être ajoutés à la bibliothèque.
    /// </summary>
    ReturningSeries = 3,

    /// <summary>
    /// Classement des lectures depuis toujours, sans fenêtre d'observation.
    /// </summary>
    /// <remarks>
    /// Même calcul que <see cref="Local"/>, fenêtre en moins : les deux cohabitent pour
    /// opposer la tendance du moment au palmarès de fond.
    /// </remarks>
    LocalAllTime = 4
}
