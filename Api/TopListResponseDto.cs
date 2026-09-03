using System;
using System.Collections.Generic;
using MediaBrowser.Model.Dto;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Une entrée de classement telle qu'exposée par l'API.
/// </summary>
/// <remarks>
/// Ce contrat ne porte QUE ce que le rendu consomme. Le score, le nombre de lectures, le
/// nombre de spectateurs distincts et la date de dernière lecture en ont été retirés : le
/// client ne les lisait pas, et ils décrivent le comportement de visionnage des autres
/// comptes. Sur un serveur familial, « un seul spectateur » et une date de dernière lecture
/// suffisent à désigner quelqu'un — c'est une information sur les personnes, pas sur les
/// titres, et elle n'a rien à faire dans une réponse lue par tous les comptes.
///
/// Ces valeurs restent calculées et conservées dans <c>TopListEntry</c> : elles servent à
/// départager les ex æquo du classement. Ce qui change ici, c'est leur publication.
/// </remarks>
public sealed class TopListItemDto
{
    /// <summary>Obtient ou définit le rang, à partir de 1.</summary>
    public int Rank { get; set; }


    /// <summary>Obtient ou définit le titre affichable.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Obtient ou définit l'année de production, si connue.</summary>
    public int? ProductionYear { get; set; }

    /// <summary>Obtient ou définit l'identifiant TMDB, si connu.</summary>
    public string? TmdbId { get; set; }

    /// <summary>Obtient ou définit l'identifiant IMDb, si connu.</summary>
    public string? ImdbId { get; set; }

    /// <summary>Obtient ou définit l'affiche externe, utilisée quand le titre n'est pas dans la bibliothèque.</summary>
    public string? PosterUrl { get; set; }

    /// <summary>
    /// Obtient ou définit l'élément Jellyfin correspondant, ou <c>null</c> si le titre
    /// n'est pas présent dans la bibliothèque (Top global uniquement).
    /// </summary>
    public BaseItemDto? Item { get; set; }
}

/// <summary>
/// Réponse d'un point d'accès de classement.
/// </summary>
public sealed class TopListResponseDto
{
    /// <summary>Obtient ou définit la nature du classement.</summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>Obtient ou définit la source des données.</summary>
    public string Source { get; set; } = string.Empty;

    /// <summary>Obtient ou définit l'instant de génération (UTC).</summary>
    public DateTime GeneratedUtc { get; set; }

    /// <summary>Obtient ou définit les entrées classées par rang croissant.</summary>
    public IReadOnlyList<TopListItemDto> Items { get; set; } = Array.Empty<TopListItemDto>();
}
