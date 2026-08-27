using System;
using System.Collections.Generic;
using MediaBrowser.Model.Dto;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Une entrée de catalogue exposée par l'API : un studio ou un genre.
/// </summary>
public sealed class CatalogEntryDto
{
    /// <summary>Obtient ou définit l'identifiant Jellyfin.</summary>
    public Guid Id { get; set; }

    /// <summary>Obtient ou définit le nom affichable.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Obtient ou définit le nombre de films et séries rattachés.</summary>
    public int ItemCount { get; set; }

    /// <summary>
    /// Obtient ou définit l'élément Jellyfin correspondant, qui porte les images
    /// (logo du studio, vignette du genre).
    /// </summary>
    public BaseItemDto? Item { get; set; }
}

/// <summary>
/// Réponse d'un point d'accès de catalogue.
/// </summary>
public sealed class CatalogResponseDto
{
    /// <summary>Obtient ou définit la nature du catalogue.</summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>Obtient ou définit l'instant de génération (UTC).</summary>
    public DateTime GeneratedUtc { get; set; }

    /// <summary>Obtient ou définit les entrées, classées par nombre de titres décroissant.</summary>
    public IReadOnlyList<CatalogEntryDto> Items { get; set; } = Array.Empty<CatalogEntryDto>();
}
