namespace JellyfinCarouselPlugin.Providers;

/// <summary>
/// Liste demandée à la source externe.
/// </summary>
public enum TrendingFeed
{
    /// <summary>
    /// Les titres les plus regardés du moment. Seule liste offerte par toutes les sources.
    /// </summary>
    Trending = 0,

    /// <summary>
    /// Ce qui sort en ce moment : films à l'affiche, séries en cours de diffusion.
    /// </summary>
    NowPlaying = 1,

    /// <summary>
    /// Les sorties à venir.
    /// </summary>
    /// <remarks>
    /// TMDB n'offre cette liste que pour les films : demander les séries seules ne renvoie
    /// rien. C'est une limite de la source, pas du plugin.
    /// </remarks>
    Upcoming = 2
}
