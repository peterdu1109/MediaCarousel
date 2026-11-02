using System;
using System.Collections.Generic;
using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Ramène le décompte d'un studio ou d'un genre aux bibliothèques que l'appelant peut voir.
/// </summary>
public static class CatalogVisibility
{
    /// <summary>
    /// Additionne les titres d'une entrée dans les seules bibliothèques visibles.
    /// </summary>
    /// <remarks>
    /// Une entrée agrégée avant la ventilation par bibliothèque n'en porte aucune : sa
    /// provenance est inconnue. Pour un compte filtré elle compte zéro, jusqu'au prochain
    /// recalcul, plutôt que de lui publier le total du serveur — nom et décompte d'un studio
    /// qui pouvait n'exister que dans une bibliothèque qui lui est interdite.
    /// </remarks>
    /// <param name="entry">L'entrée du catalogue.</param>
    /// <param name="visibleLibraries">Bibliothèques visibles, ou <see langword="null"/> sans utilisateur (clé d'API).</param>
    /// <returns>Le nombre de titres visibles.</returns>
    public static int Count(CatalogEntry entry, IReadOnlyCollection<Guid>? visibleLibraries)
    {
        ArgumentNullException.ThrowIfNull(entry);

        // Pas d'utilisateur rattaché — une clé d'API, qui vaut administrateur : rien à filtrer.
        if (visibleLibraries is null)
        {
            return entry.ItemCount;
        }

        var total = 0;
        foreach (var libraryId in visibleLibraries)
        {
            if (entry.CountsByLibrary.TryGetValue(libraryId, out var count))
            {
                total += count;
            }
        }

        return total;
    }
}
