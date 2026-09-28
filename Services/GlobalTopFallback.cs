using System;
using System.Collections.Generic;
using System.Linq;
using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Sert une liste du Top mondial qui n'existe pas encore à partir de celle qui existe.
/// </summary>
/// <remarks>
/// Passer d'une rangée mêlée à deux rangées séparées — ou l'inverse — ne produit les nouvelles
/// listes qu'au recalcul. Constaté en prod le 2026-09-28 : la case cochée, le Top mondial
/// disparaissait jusque-là. En attendant, les films et les séries sont tirés de la liste mêlée,
/// ou la liste mêlée est refaite des deux moitiés.
/// </remarks>
public static class GlobalTopFallback
{
    /// <summary>
    /// Obtient la liste demandée, ou à défaut celle qu'on peut en tirer.
    /// </summary>
    /// <param name="kind">Nature demandée.</param>
    /// <param name="get">Lecture d'un instantané publié.</param>
    /// <returns>L'instantané publié s'il a des entrées, sinon celui qu'on en déduit.</returns>
    public static TopListSnapshot For(TopListKind kind, Func<TopListKind, TopListSnapshot> get)
    {
        ArgumentNullException.ThrowIfNull(get);

        var own = get(kind);
        if (own.Entries.Count > 0)
        {
            return own;
        }

        return kind switch
        {
            TopListKind.GlobalMovies => Derive(kind, get(TopListKind.Global).Entries.Where(e => e.MediaType == SeerrRules.Movie), own),
            TopListKind.GlobalSeries => Derive(kind, get(TopListKind.Global).Entries.Where(e => e.MediaType == SeerrRules.Tv), own),
            TopListKind.Global => Derive(kind, get(TopListKind.GlobalMovies).Entries.Concat(get(TopListKind.GlobalSeries).Entries), own),
            _ => own
        };
    }

    private static TopListSnapshot Derive(TopListKind kind, IEnumerable<TopListEntry> entries, TopListSnapshot own)
    {
        var picked = entries
            .Select((e, index) => new TopListEntry
            {
                Rank = index + 1,
                ItemId = e.ItemId,
                Name = e.Name,
                ProductionYear = e.ProductionYear,
                TmdbId = e.TmdbId,
                ImdbId = e.ImdbId,
                PosterUrl = e.PosterUrl,
                MediaType = e.MediaType
            })
            .ToArray();

        return picked.Length == 0 ? own : new TopListSnapshot(kind, "Fallback", picked);
    }
}
