using System;

namespace JellyfinCarouselPlugin.Models;

/// <summary>
/// Une entrée classée d'un Top N. Immuable une fois publiée dans un <see cref="TopListSnapshot"/>.
/// </summary>
public sealed class TopListEntry
{
    /// <summary>
    /// Obtient ou définit le rang, à partir de 1.
    /// </summary>
    public int Rank { get; set; }

    /// <summary>
    /// Obtient ou définit l'identifiant de l'élément dans la bibliothèque Jellyfin.
    /// <see cref="Guid.Empty"/> quand le titre n'est pas présent localement (Top global uniquement).
    /// </summary>
    public Guid ItemId { get; set; }

    /// <summary>
    /// Obtient ou définit le titre affichable, utilisé quand l'élément n'est pas dans la bibliothèque.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Obtient ou définit l'année de production, si connue.
    /// </summary>
    public int? ProductionYear { get; set; }

    /// <summary>
    /// Obtient ou définit le score de classement (lectures pondérées pour le Top local,
    /// score de popularité de la source pour le Top global).
    /// </summary>
    public double Score { get; set; }

    /// <summary>
    /// Obtient ou définit le nombre total de lectures comptabilisées (Top local).
    /// </summary>
    public int TotalPlays { get; set; }

    /// <summary>
    /// Obtient ou définit le nombre d'utilisateurs distincts ayant lu le titre (Top local).
    /// </summary>
    public int DistinctViewers { get; set; }

    /// <summary>
    /// Obtient ou définit la date de dernière lecture, tous utilisateurs confondus (Top local).
    /// </summary>
    public DateTime? LastPlayedUtc { get; set; }

    /// <summary>
    /// Obtient ou définit l'identifiant TMDB, si connu.
    /// </summary>
    public string? TmdbId { get; set; }

    /// <summary>
    /// Obtient ou définit l'identifiant IMDb, si connu.
    /// </summary>
    public string? ImdbId { get; set; }

    /// <summary>
    /// Obtient ou définit l'affiche fournie par la source externe, utilisée quand le titre
    /// n'est pas présent dans la bibliothèque.
    /// </summary>
    public string? PosterUrl { get; set; }

    /// <summary>
    /// Obtient une valeur indiquant si le titre existe dans la bibliothèque locale.
    /// </summary>
    public bool IsInLibrary => ItemId != Guid.Empty;
}
