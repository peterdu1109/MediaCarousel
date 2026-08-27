using System;
using System.Collections.Generic;

namespace JellyfinCarouselPlugin.Models;

/// <summary>
/// Résultat figé d'un calcul de classement. Publié en bloc dans le <see cref="Services.ITopListStore"/>
/// pour être lu sans verrou par les requêtes HTTP.
/// </summary>
public sealed class TopListSnapshot
{
    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TopListSnapshot"/>.
    /// </summary>
    /// <param name="kind">Nature du classement.</param>
    /// <param name="source">Source des données (« Jellyfin », « TMDB », « Trakt »).</param>
    /// <param name="entries">Entrées déjà triées et rangées.</param>
    public TopListSnapshot(TopListKind kind, string source, IReadOnlyList<TopListEntry> entries)
        : this(kind, source, entries, DateTime.UtcNow)
    {
    }

    private TopListSnapshot(TopListKind kind, string source, IReadOnlyList<TopListEntry> entries, DateTime generatedUtc)
    {
        Kind = kind;
        Source = source;
        Entries = entries;
        GeneratedUtc = generatedUtc;
    }

    /// <summary>
    /// Obtient la nature du classement.
    /// </summary>
    public TopListKind Kind { get; }

    /// <summary>
    /// Obtient la source des données.
    /// </summary>
    public string Source { get; }

    /// <summary>
    /// Obtient l'instant de génération (UTC).
    /// </summary>
    public DateTime GeneratedUtc { get; }

    /// <summary>
    /// Obtient les entrées classées par rang croissant.
    /// </summary>
    public IReadOnlyList<TopListEntry> Entries { get; }

    /// <summary>
    /// Obtient un instantané vide, utilisé tant qu'aucun calcul n'a eu lieu.
    /// </summary>
    /// <param name="kind">Nature du classement.</param>
    /// <returns>Un instantané sans entrée.</returns>
    public static TopListSnapshot Empty(TopListKind kind) => new(kind, "None", Array.Empty<TopListEntry>());

    /// <summary>
    /// Reconstitue un instantané lu depuis le disque, en conservant sa date de génération
    /// d'origine plutôt que celle du rechargement.
    /// </summary>
    /// <param name="kind">Nature de la liste.</param>
    /// <param name="source">Source des données.</param>
    /// <param name="entries">Entrées classées.</param>
    /// <param name="generatedUtc">Instant du calcul d'origine.</param>
    /// <returns>L'instantané reconstitué.</returns>
    public static TopListSnapshot Restore(
        TopListKind kind,
        string source,
        IReadOnlyList<TopListEntry> entries,
        DateTime generatedUtc) => new(kind, source, entries, generatedUtc);
}
