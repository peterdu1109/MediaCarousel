using System;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Décide si une collection existante doit prendre le nom réglé dans la page de configuration.
/// </summary>
/// <remarks>
/// Le nom ne servait qu'à la création : renommer la collection dans les réglages restait sans
/// effet sur celle qui existait déjà. Sans dépendance Jellyfin pour rester testable seule.
/// </remarks>
public static class CollectionNaming
{
    /// <summary>
    /// Indique si la collection doit être renommée.
    /// </summary>
    /// <param name="currentName">Le nom actuel de la collection.</param>
    /// <param name="desiredName">Le nom réglé.</param>
    /// <returns>Vrai si le nom réglé est exploitable et diffère du nom actuel.</returns>
    public static bool NeedsRename(string? currentName, string? desiredName)
        => !string.IsNullOrWhiteSpace(desiredName)
            && !string.Equals(currentName, desiredName.Trim(), StringComparison.Ordinal);
}
