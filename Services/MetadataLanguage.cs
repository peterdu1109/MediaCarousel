namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Langue demandée à la source de tendances pour les titres et les affiches.
/// </summary>
/// <remarks>
/// Reprise des métadonnées de Jellyfin (Tableau de bord, Bibliothèques) : la page de réglages
/// n'a plus de champ à saisir pour cela depuis la 4.5.0. Le réglage du plugin ne sert plus que
/// si Jellyfin n'a pas de langue choisie.
/// </remarks>
public static class MetadataLanguage
{
    /// <summary>
    /// Compose la langue au format de TMDB, par exemple <c>fr-FR</c>.
    /// </summary>
    /// <param name="language">La langue préférée des métadonnées de Jellyfin (<c>fr</c>).</param>
    /// <param name="country">Le pays des métadonnées de Jellyfin (<c>FR</c>).</param>
    /// <param name="fallback">Le réglage du plugin, si Jellyfin n'a pas de langue.</param>
    /// <returns>La langue à demander.</returns>
    public static string Resolve(string? language, string? country, string? fallback)
    {
        var lang = language?.Trim();

        if (string.IsNullOrEmpty(lang))
        {
            return string.IsNullOrWhiteSpace(fallback) ? "en-US" : fallback.Trim();
        }

        // Jellyfin peut déjà porter une forme complète, comme « pt-BR ».
        if (lang.Contains('-'))
        {
            return lang;
        }

        var region = country?.Trim();
        return string.IsNullOrEmpty(region)
            ? lang.ToLowerInvariant()
            : lang.ToLowerInvariant() + "-" + region.ToUpperInvariant();
    }
}
