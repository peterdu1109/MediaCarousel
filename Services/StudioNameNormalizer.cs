using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Réduit un nom de studio à son identité, pour regrouper les variantes d'une même société.
/// </summary>
/// <remarks>
/// Les fournisseurs de métadonnées écrivent le même studio sous plusieurs libellés :
/// « Warner Bros. », « Warner Bros. Pictures » et « Warner Bros. Animation » sont trois
/// entrées distinctes dans Jellyfin. Sans regroupement, la rangée des studios affiche trois
/// fois le même studio.
/// </remarks>
public static class StudioNameNormalizer
{
    /// <summary>
    /// Mots qui décrivent la nature d'une société plutôt que son identité.
    /// </summary>
    private static readonly HashSet<string> NoiseWords = new(StringComparer.Ordinal)
    {
        "the", "and",
        "pictures", "picture", "studios", "studio", "entertainment", "entertainments",
        "films", "film", "productions", "production", "television", "tv", "media",
        "group", "company", "co", "corporation", "corp", "inc", "incorporated",
        "ltd", "limited", "llc", "sa", "sas", "gmbh", "ag", "bv", "kk",
        "international", "intl", "home", "video", "distribution", "releasing", "cinema",
        "cinemas", "animation", "animations", "interactive", "network", "networks"
    };

    /// <summary>
    /// Calcule la clé de regroupement d'un nom de studio : sans accents, sans ponctuation,
    /// sans les mots décrivant la nature de la société.
    /// </summary>
    /// <remarks>
    /// Si le nom n'est composé que de tels mots — « Studio », « Films » — la forme sans
    /// ponctuation est conservée, pour ne pas fusionner des sociétés sans rapport sous une
    /// clé vide.
    /// </remarks>
    /// <param name="name">Nom tel qu'enregistré dans Jellyfin.</param>
    /// <returns>La clé de regroupement, éventuellement vide si le nom ne contient rien d'exploitable.</returns>
    public static string Normalize(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return string.Empty;
        }

        var normalized = name.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToLowerInvariant(character));
            }
            else if (builder.Length > 0 && builder[^1] != ' ')
            {
                // Toute ponctuation devient une simple césure : « Warner Bros. » et
                // « Warner Bros » produisent la même clé.
                builder.Append(' ');
            }
        }

        var words = builder.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var identity = words.Where(word => !NoiseWords.Contains(word)).ToArray();

        return string.Join(' ', identity.Length > 0 ? identity : words);
    }
}
