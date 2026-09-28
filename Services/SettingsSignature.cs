using System;
using System.Text.Json.Nodes;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Empreinte des réglages du plugin, pour savoir si un enregistrement a changé quelque chose.
/// </summary>
public static class SettingsSignature
{
    /// <summary>
    /// Réglages que le recalcul écrit lui-même : les compter le relancerait sans fin.
    /// </summary>
    private static readonly string[] WrittenByRefresh = { "LocalCollectionId", "GlobalCollectionId" };

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

        var copy = (JsonObject)settings.DeepClone();
        foreach (var key in WrittenByRefresh)
        {
            copy.Remove(key);
        }

        return copy.ToJsonString();
    }
}
