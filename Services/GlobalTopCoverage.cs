using System;
using System.Linq;
using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Combien de titres du Top mondial la bibliothèque possède déjà.
/// </summary>
public static class GlobalTopCoverage
{
    /// <summary>
    /// Compte les titres présents dans la bibliothèque parmi ceux que les rangées affichent.
    /// </summary>
    /// <remarks>
    /// Les trois listes coexistent dans le stockage : la liste mêlée et les deux séparées, dont
    /// l'une est un reste du réglage précédent. Les additionner comptait chaque titre deux fois.
    /// On mesure donc celles que l'accueil montre ; à défaut, celle qui a des titres.
    /// </remarks>
    /// <param name="split">Vrai quand films et séries ont chacun leur rangée.</param>
    /// <param name="get">Lecture d'un instantané publié.</param>
    /// <returns>Les titres présents et le total.</returns>
    public static (int InLibrary, int Total) Measure(bool split, Func<TopListKind, TopListSnapshot> get)
    {
        ArgumentNullException.ThrowIfNull(get);

        var shown = split
            ? new[] { get(TopListKind.GlobalMovies), get(TopListKind.GlobalSeries) }
            : new[] { get(TopListKind.Global) };

        if (shown.All(s => s.Entries.Count == 0))
        {
            shown = split
                ? new[] { get(TopListKind.Global) }
                : new[] { get(TopListKind.GlobalMovies), get(TopListKind.GlobalSeries) };
        }

        var entries = shown.SelectMany(s => s.Entries).ToArray();
        return (entries.Count(e => e.IsInLibrary), entries.Length);
    }
}
