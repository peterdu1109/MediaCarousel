using System;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Ramène les dates de lecture rendues par Jellyfin à de l'UTC, sans les décaler.
/// </summary>
/// <remarks>
/// Cette classe est délibérément sans dépendance Jellyfin : c'est ce qui permet de la
/// couvrir de tests, la règle qu'elle porte étant impossible à vérifier à l'œil.
/// </remarks>
public static class PlaybackDate
{
    /// <summary>
    /// Qualifie une date de lecture en UTC.
    /// </summary>
    /// <remarks>
    /// Jellyfin écrit ses dates en UTC — la lecture est horodatée avec
    /// <c>DateTime.UtcNow</c> — mais EF Core sur SQLite les relit en
    /// <see cref="DateTimeKind.Unspecified"/>. Or <c>ToUniversalTime()</c> sur une date non
    /// qualifiée la considère comme LOCALE et lui applique le décalage du serveur : une
    /// lecture de 1 h du matin à Paris ressortait à 23 h la veille, donc un jour plus tôt.
    /// Sur une fenêtre d'observation, cela déplace la frontière de plusieurs heures et fait
    /// entrer ou sortir des titres à tort.
    ///
    /// Une date non qualifiée est donc lue comme ce qu'elle est : de l'UTC. Les dates déjà
    /// qualifiées, elles, sont converties normalement.
    /// </remarks>
    /// <param name="value">La date telle que rendue par Jellyfin.</param>
    /// <returns>Le même instant, qualifié en UTC.</returns>
    public static DateTime AsUtc(DateTime value)
        => value.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(value, DateTimeKind.Utc)
            : value.ToUniversalTime();
}
