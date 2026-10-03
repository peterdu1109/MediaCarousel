using System;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Le texte de la fiche de l'extension, dans la langue du serveur.
/// </summary>
/// <remarks>
/// Jellyfin affiche <c>Plugin.Description</c> sur la fiche d'une extension chargée. Avant le
/// redémarrage qui suit une installation, et dans le catalogue, il montre la description du
/// dépôt : un fichier fixe, lu tel quel par tous les serveurs, qui porte donc les deux langues
/// (<c>repository-12.json</c>) et doit dire la même chose que ces deux textes.
/// </remarks>
public static class PluginDescription
{
    /// <summary>Le texte en français.</summary>
    public const string French =
        "Des rangées façon Netflix sur la page d'accueil : Top 10 du serveur d'après les vraies lectures, "
        + "Top 10 mondial (TMDB ou Trakt), demandes à Seerr, et rangées tirées de la bibliothèque.";

    /// <summary>Le texte en anglais.</summary>
    public const string English =
        "Netflix-style home rows: a server Top 10 from real playback, a worldwide Top 10 (TMDB or Trakt), "
        + "Seerr requests, and rows built from your library.";

    /// <summary>
    /// Choisit le texte d'après la langue d'affichage du serveur.
    /// </summary>
    /// <param name="uiCulture">La langue du serveur, par exemple « fr-FR », ou <c>null</c>.</param>
    /// <returns>Le français pour toute variante du français, l'anglais pour toute autre langue.</returns>
    public static string For(string? uiCulture)
    {
        var language = (uiCulture ?? string.Empty).Split('-', '_')[0];
        return string.Equals(language, "fr", StringComparison.OrdinalIgnoreCase) ? French : English;
    }
}
