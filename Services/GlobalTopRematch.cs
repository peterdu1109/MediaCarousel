using System;
using System.Collections.Generic;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.Providers;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Refait le rapprochement d'un classement externe avec la bibliothèque, sans rappeler sa source.
/// </summary>
/// <remarks>
/// Un titre demandé via Seerr arrive dans la bibliothèque entre deux recalculs : sans cela, il
/// restait « absent » — affiche relayée, bouton de demande — jusqu'au recalcul suivant, parfois
/// un jour plus tard. À l'inverse, un titre supprimé de la bibliothèque redevient absent.
/// </remarks>
public static class GlobalTopRematch
{
    /// <summary>
    /// Rapproche de nouveau chaque entrée de l'instantané.
    /// </summary>
    /// <param name="snapshot">Instantané publié.</param>
    /// <param name="resolve">Élément local correspondant à un titre, ou <see cref="Guid.Empty"/>.</param>
    /// <returns>
    /// Le nouvel instantané — même rang, même date de calcul — ou <c>null</c> si aucune
    /// présence n'a changé.
    /// </returns>
    public static TopListSnapshot? Apply(TopListSnapshot snapshot, Func<TrendingTitle, Guid> resolve)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        ArgumentNullException.ThrowIfNull(resolve);

        var changed = false;
        var used = new HashSet<Guid>();
        var entries = new List<TopListEntry>(snapshot.Entries.Count);

        foreach (var entry in snapshot.Entries)
        {
            var itemId = entry.ItemId;

            // Une entrée calculée avant les demandes Seerr ne dit pas si c'est un film ou une
            // série : on ne saurait pas dans quel index la chercher. Elle attend le recalcul.
            if (SeerrRules.IsMediaType(entry.MediaType))
            {
                itemId = resolve(new TrendingTitle(
                    entry.Rank,
                    entry.Name,
                    entry.ProductionYear,
                    entry.TmdbId,
                    entry.ImdbId,
                    string.Equals(entry.MediaType, SeerrRules.Movie, StringComparison.Ordinal),
                    0,
                    entry.PosterUrl));
            }

            // Comme au calcul : deux entrées ne montrent jamais la même affiche.
            if (itemId != Guid.Empty && !used.Add(itemId))
            {
                itemId = Guid.Empty;
            }

            changed |= itemId != entry.ItemId;
            entries.Add(new TopListEntry
            {
                Rank = entry.Rank,
                ItemId = itemId,
                Name = entry.Name,
                ProductionYear = entry.ProductionYear,
                TmdbId = entry.TmdbId,
                ImdbId = entry.ImdbId,
                PosterUrl = entry.PosterUrl,
                MediaType = entry.MediaType
            });
        }

        // La date reste celle du calcul : la tuile « Dernier calcul » ne doit pas prétendre
        // qu'un recalcul complet vient d'avoir lieu.
        return changed
            ? TopListSnapshot.Restore(snapshot.Kind, snapshot.Source, entries, snapshot.GeneratedUtc)
            : null;
    }

    /// <summary>
    /// Clés de rapprochement d'un titre : <c>movie:tmdb</c> ou <c>tv:tmdb</c>, et <c>imdb:tt…</c>.
    /// Les numéros TMDB des films et des séries se recouvrent : le type fait partie de la clé.
    /// </summary>
    /// <param name="mediaType"><c>movie</c> ou <c>tv</c>.</param>
    /// <param name="tmdbId">Identifiant TMDB, ou <c>null</c>.</param>
    /// <param name="imdbId">Identifiant IMDb, ou <c>null</c>.</param>
    /// <returns>Les clés non vides.</returns>
    public static IEnumerable<string> KeysFor(string mediaType, string? tmdbId, string? imdbId)
    {
        if (!string.IsNullOrWhiteSpace(tmdbId))
        {
            yield return mediaType + ":" + tmdbId.Trim();
        }

        if (!string.IsNullOrWhiteSpace(imdbId))
        {
            yield return "imdb:" + imdbId.Trim();
        }
    }
}
