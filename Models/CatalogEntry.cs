using System;

namespace JellyfinCarouselPlugin.Models;

/// <summary>
/// Une entrée de catalogue : un studio ou un genre, avec le nombre de titres qui s'y rattachent.
/// </summary>
public sealed class CatalogEntry
{
    /// <summary>
    /// Obtient ou définit l'identifiant Jellyfin du studio ou du genre.
    /// </summary>
    public Guid ItemId { get; set; }

    /// <summary>
    /// Obtient ou définit le nom affichable.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Obtient ou définit le nombre de films et séries rattachés.
    /// </summary>
    public int ItemCount { get; set; }
}
