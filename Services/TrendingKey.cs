using System;
using System.Globalization;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Fabrique la clé qui identifie un titre externe, pour écarter les doublons.
/// </summary>
/// <remarks>
/// <para>
/// La règle vit ici plutôt que d'être recopiée dans le fournisseur et dans le constructeur
/// du classement : les deux doivent écarter les mêmes doublons, et deux copies de la même
/// règle finissent toujours par diverger.
/// </para>
/// <para>
/// Cette classe est délibérément sans dépendance Jellyfin, ce qui permet de la couvrir de
/// tests — le doublon ne se voit autrement qu'à l'écran, et seulement quand la source a la
/// bonne idée d'en produire un.
/// </para>
/// </remarks>
public static class TrendingKey
{
    /// <summary>
    /// Construit la clé d'un titre externe.
    /// </summary>
    /// <remarks>
    /// L'identifiant TMDB prime quand il est connu, préfixé par le type : TMDB numérote
    /// films et séries indépendamment, si bien que l'identifiant 42 désigne deux œuvres
    /// différentes selon le type. Sans identifiant, la clé retombe sur le nom normalisé et
    /// l'année : deux œuvres homonymes de la même année sont assez rares pour que le risque
    /// de les confondre soit moindre que celui d'afficher deux fois la même affiche.
    /// </remarks>
    /// <param name="tmdbId">Identifiant TMDB, s'il est connu.</param>
    /// <param name="isMovie">Vrai pour un film, faux pour une série.</param>
    /// <param name="title">Titre affiché.</param>
    /// <param name="year">Année de production ou de première diffusion.</param>
    /// <returns>Une clé stable, comparable avec <see cref="StringComparer.Ordinal"/>.</returns>
    public static string For(string? tmdbId, bool isMovie, string? title, int? year)
    {
        var prefix = isMovie ? "m:" : "s:";

        if (!string.IsNullOrWhiteSpace(tmdbId))
        {
            return prefix + tmdbId.Trim();
        }

        var normalized = (title ?? string.Empty).Trim().ToLowerInvariant();

        return prefix + normalized + "|"
            + (year.HasValue ? year.Value.ToString(CultureInfo.InvariantCulture) : "?");
    }
}
