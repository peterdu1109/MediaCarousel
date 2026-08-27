namespace JellyfinCarouselPlugin.Providers;

/// <summary>
/// Un titre renvoyé par une base de données externe de tendances.
/// </summary>
/// <param name="Rank">Rang dans le classement de la source, à partir de 1.</param>
/// <param name="Title">Titre affichable.</param>
/// <param name="Year">Année de sortie, si connue.</param>
/// <param name="TmdbId">Identifiant TMDB, si connu.</param>
/// <param name="ImdbId">Identifiant IMDb, si connu.</param>
/// <param name="IsMovie"><c>true</c> pour un film, <c>false</c> pour une série.</param>
/// <param name="Popularity">Score de popularité brut fourni par la source.</param>
/// <param name="PosterUrl">Affiche fournie par la source, ou <c>null</c>.</param>
public sealed record TrendingTitle(
    int Rank,
    string Title,
    int? Year,
    string? TmdbId,
    string? ImdbId,
    bool IsMovie,
    double Popularity,
    string? PosterUrl);
