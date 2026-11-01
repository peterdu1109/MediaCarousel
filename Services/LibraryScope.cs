using System;
using System.Collections.Generic;
using System.Linq;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Calcule les bibliothèques auxquelles une requête de classement doit se restreindre.
/// </summary>
/// <remarks>
/// Filtrer après une requête limitée ne suffit pas : un catalogue IPTV ou une bibliothèque
/// exclue peut occuper toutes les places de la limite, et la rangée sort vide. La restriction
/// doit donc porter sur la requête elle-même, par ses ancêtres. Sans dépendance Jellyfin pour
/// rester testable seule.
/// </remarks>
public static class LibraryScope
{
    /// <summary>
    /// Retire les bibliothèques exclues de la liste des bibliothèques du serveur.
    /// </summary>
    /// <param name="libraries">Les identifiants des bibliothèques du serveur.</param>
    /// <param name="excludedLibraries">Les identifiants des bibliothèques exclues.</param>
    /// <returns>Les bibliothèques à interroger, sans doublon, dans l'ordre reçu.</returns>
    public static Guid[] Allowed(IEnumerable<Guid> libraries, IReadOnlyCollection<Guid> excludedLibraries)
    {
        ArgumentNullException.ThrowIfNull(libraries);
        ArgumentNullException.ThrowIfNull(excludedLibraries);

        return libraries
            .Where(id => id != Guid.Empty && !excludedLibraries.Contains(id))
            .Distinct()
            .ToArray();
    }
}
