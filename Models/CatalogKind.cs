namespace JellyfinCarouselPlugin.Models;

/// <summary>
/// Nature d'un catalogue agrégé par le plugin.
/// </summary>
public enum CatalogKind
{
    /// <summary>Studios de production, classés par nombre de titres.</summary>
    Studios = 0,

    /// <summary>Genres, classés par nombre de titres.</summary>
    Genres = 1
}
