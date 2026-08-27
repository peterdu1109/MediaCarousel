using System;
using System.Collections.Generic;

namespace JellyfinCarouselPlugin.Models;

/// <summary>
/// Résultat figé d'une agrégation de catalogue, publié en bloc pour être lu sans verrou.
/// </summary>
public sealed class CatalogSnapshot
{
    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="CatalogSnapshot"/>.
    /// </summary>
    /// <param name="kind">Nature du catalogue.</param>
    /// <param name="entries">Entrées déjà triées par nombre de titres décroissant.</param>
    public CatalogSnapshot(CatalogKind kind, IReadOnlyList<CatalogEntry> entries)
    {
        Kind = kind;
        Entries = entries;
        GeneratedUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Obtient la nature du catalogue.
    /// </summary>
    public CatalogKind Kind { get; }

    /// <summary>
    /// Obtient l'instant de génération (UTC).
    /// </summary>
    public DateTime GeneratedUtc { get; }

    /// <summary>
    /// Obtient les entrées, classées par nombre de titres décroissant.
    /// </summary>
    public IReadOnlyList<CatalogEntry> Entries { get; }

    /// <summary>
    /// Obtient un catalogue vide, utilisé tant qu'aucune agrégation n'a eu lieu.
    /// </summary>
    /// <param name="kind">Nature du catalogue.</param>
    /// <returns>Un catalogue sans entrée.</returns>
    public static CatalogSnapshot Empty(CatalogKind kind) => new(kind, Array.Empty<CatalogEntry>());
}
