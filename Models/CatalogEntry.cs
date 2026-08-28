using System;
using System.Collections.Generic;

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
    /// Obtient ou définit le nombre de films et séries rattachés, toutes bibliothèques confondues.
    /// </summary>
    public int ItemCount { get; set; }

    /// <summary>
    /// Obtient ou définit le nombre de titres rattachés, ventilé par bibliothèque.
    /// </summary>
    /// <remarks>
    /// L'agrégation est globale, mais la lecture ne l'est pas : à la requête, seules les
    /// bibliothèques visibles par l'appelant sont additionnées, et une entrée qui n'existe
    /// que dans une bibliothèque interdite disparaît de la rangée au lieu d'y afficher un
    /// nom menant à une page vide.
    /// </remarks>
    public Dictionary<Guid, int> CountsByLibrary { get; set; } = new();
}
