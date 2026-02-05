using MediaBrowser.Model.Plugins;

namespace JellyfinCarouselPlugin.Configuration;

/// <summary>
/// Configuration pour le plugin Carousel Layout
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Active ou désactive l'affichage en carrousel
    /// </summary>
    public bool EnableCarouselLayout { get; set; } = true;

    /// <summary>
    /// Active la catégorie "Nouveautés"
    /// </summary>
    public bool ShowNewReleases { get; set; } = true;

    /// <summary>
    /// Active la catégorie "Top 10"
    /// </summary>
    public bool ShowTop10 { get; set; } = true;

    /// <summary>
    /// Active la catégorie "Continuer à regarder"
    /// </summary>
    public bool ShowContinueWatching { get; set; } = true;

    /// <summary>
    /// Active la catégorie "Recommandés"
    /// </summary>
    public bool ShowRecommended { get; set; } = true;

    /// <summary>
    /// Active les catégories par genre
    /// </summary>
    public bool ShowGenreCategories { get; set; } = true;

    /// <summary>
    /// Active le badge "NOUVEAUX ÉPISODES"
    /// </summary>
    public bool ShowNewEpisodesBadge { get; set; } = true;

    /// <summary>
    /// Active l'affichage de la qualité (4K, HD, etc.)
    /// </summary>
    public bool ShowQualityBadge { get; set; } = true;

    /// <summary>
    /// Nombre d'éléments par carrousel
    /// </summary>
    public int ItemsPerCarousel { get; set; } = 20;

    /// <summary>
    /// Active les animations de hover
    /// </summary>
    public bool EnableHoverAnimations { get; set; } = true;
}
