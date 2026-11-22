using System;
using System.Text.Json.Nodes;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Empreinte des réglages du plugin, pour savoir si un enregistrement a changé quelque chose.
/// </summary>
public static class SettingsSignature
{
    /// <summary>
    /// Réglages qu'un calcul de rangée lit : seuls leurs changements justifient un recalcul.
    /// Liste blanche — un réglage d'affichage (couleur, titres, ordre, Seerr) ou écrit par le
    /// recalcul lui-même (identifiants de collection) n'en fait pas partie. Un réglage de calcul
    /// ajouté à PluginConfiguration doit l'être ici, faute de quoi son changement attend le
    /// recalcul planifié.
    /// </summary>
    private static readonly string[] Computed =
    {
        "EnableLocalTop", "LocalTopSize", "LocalTopMediaKind", "LocalTopWindowDays",
        "MaxPlaysCountedPerUser", "CandidatesPerUser", "ExcludedUserIds", "ExcludedLibraryIds",
        "ExcludeChannelContent", "EnableGlobalTop", "GlobalTopProvider", "GlobalTopApiKey",
        "GlobalTopMediaKind", "GlobalTopFeed", "GlobalTopSize", "GlobalTopLibraryOnly",
        "GlobalTopSplitByType", "MetadataLanguage", "EnableStudioRow", "StudioRowSize",
        "MinItemsPerStudio", "EnableGenreRows", "GenreRowCount", "MinItemsPerGenre",
        "EnableNeverPlayedRow", "NeverPlayedRowSize", "NeverPlayedMinRating",
        "EnableReturningRow", "ReturningRowDays", "ReturningRowSize", "EnableAllTimeRow",
        "AllTimeRowSize", "SyncCollections", "LocalCollectionName", "GlobalCollectionName"
    };

    /// <summary>
    /// Calcule l'empreinte de réglages sérialisés.
    /// </summary>
    /// <param name="settings">Les réglages, en JSON.</param>
    /// <returns>Une chaîne égale pour deux réglages équivalents.</returns>
    public static string Of(JsonObject? settings)
    {
        if (settings is null)
        {
            return string.Empty;
        }

        var kept = new JsonObject();
        foreach (var key in Computed)
        {
            if (settings.TryGetPropertyValue(key, out var value))
            {
                kept[key] = value?.DeepClone();
            }
        }

        return kept.ToJsonString();
    }
}
