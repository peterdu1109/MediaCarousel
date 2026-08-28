using System;
using System.Collections.Generic;
using System.Linq;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Un titre lu par un utilisateur, tel qu'il entre dans le classement du serveur.
/// </summary>
/// <param name="ItemId">Titre classé — pour un épisode, sa série.</param>
/// <param name="Name">Nom affiché.</param>
/// <param name="ProductionYear">Année de production.</param>
/// <param name="TmdbId">Identifiant TMDB, s'il est connu.</param>
/// <param name="ImdbId">Identifiant IMDb, s'il est connu.</param>
/// <param name="UserId">Compte à l'origine de ces lectures.</param>
/// <param name="PlayCount">Nombre de lectures de ce compte, valeur brute.</param>
/// <param name="LastPlayedUtc">Dernière lecture par ce compte (UTC).</param>
public readonly record struct TopListCandidate(
    Guid ItemId,
    string Name,
    int? ProductionYear,
    string? TmdbId,
    string? ImdbId,
    Guid UserId,
    int PlayCount,
    DateTime? LastPlayedUtc);

/// <summary>
/// Un titre classé, une fois toutes les lectures agrégées.
/// </summary>
public sealed class TopListRanking
{
    /// <summary>Obtient ou définit le rang, à partir de 1.</summary>
    public int Rank { get; set; }

    /// <summary>Obtient ou définit l'identifiant du titre.</summary>
    public Guid ItemId { get; set; }

    /// <summary>Obtient ou définit le nom affiché.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Obtient ou définit l'année de production.</summary>
    public int? ProductionYear { get; set; }

    /// <summary>Obtient ou définit l'identifiant TMDB.</summary>
    public string? TmdbId { get; set; }

    /// <summary>Obtient ou définit l'identifiant IMDb.</summary>
    public string? ImdbId { get; set; }

    /// <summary>Obtient ou définit le score, plafonné par utilisateur.</summary>
    public double Score { get; set; }

    /// <summary>Obtient ou définit le nombre de lectures réel, sans plafond.</summary>
    public int TotalPlays { get; set; }

    /// <summary>Obtient ou définit le nombre de comptes distincts ayant lu le titre.</summary>
    public int DistinctViewers { get; set; }

    /// <summary>Obtient ou définit la lecture la plus récente, tous comptes confondus (UTC).</summary>
    public DateTime? LastPlayedUtc { get; set; }
}

/// <summary>
/// Agrège les lectures de tous les comptes en un classement du serveur.
/// </summary>
/// <remarks>
/// <para>
/// Cette classe ne dépend d'aucun type Jellyfin : c'est ce qui permet de la couvrir de
/// tests. Le service qui l'utilise se charge d'interroger la base et de rabattre les
/// épisodes sur leur série ; ici, il n'y a que la règle de classement.
/// </para>
/// <para>
/// Le plafond par utilisateur est ce qui empêche un seul spectateur qui revoit un film en
/// boucle de dominer le classement : il borne la contribution de chaque compte au score,
/// tandis que <see cref="TopListRanking.TotalPlays"/> conserve la valeur brute pour
/// l'affichage.
/// </para>
/// </remarks>
public sealed class TopListAccumulator
{
    private readonly Dictionary<Guid, Aggregate> _aggregates = new();
    private readonly int _playCap;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TopListAccumulator"/>.
    /// </summary>
    /// <param name="playCap">
    /// Nombre maximal de lectures comptées par utilisateur et par titre. Une valeur nulle ou
    /// négative retire le plafond.
    /// </param>
    public TopListAccumulator(int playCap)
        => _playCap = playCap > 0 ? playCap : int.MaxValue;

    /// <summary>
    /// Obtient le nombre de titres distincts rencontrés.
    /// </summary>
    public int DistinctItems => _aggregates.Count;

    /// <summary>
    /// Verse les lectures d'un compte sur un titre dans les agrégats.
    /// </summary>
    /// <param name="candidate">Le titre lu et le compte qui l'a lu.</param>
    public void Add(TopListCandidate candidate)
    {
        if (candidate.ItemId == Guid.Empty || candidate.PlayCount <= 0)
        {
            return;
        }

        if (!_aggregates.TryGetValue(candidate.ItemId, out var aggregate))
        {
            aggregate = new Aggregate
            {
                ItemId = candidate.ItemId,
                Name = candidate.Name,
                ProductionYear = candidate.ProductionYear,
                TmdbId = candidate.TmdbId,
                ImdbId = candidate.ImdbId
            };
            _aggregates[candidate.ItemId] = aggregate;
        }

        aggregate.Score += Math.Min(candidate.PlayCount, _playCap);
        aggregate.TotalPlays += candidate.PlayCount;
        aggregate.Viewers.Add(candidate.UserId);

        if (candidate.LastPlayedUtc.HasValue
            && (!aggregate.LastPlayedUtc.HasValue || candidate.LastPlayedUtc.Value > aggregate.LastPlayedUtc.Value))
        {
            aggregate.LastPlayedUtc = candidate.LastPlayedUtc;
        }
    }

    /// <summary>
    /// Classe les titres agrégés.
    /// </summary>
    /// <remarks>
    /// Départage d'abord sur le score, puis sur le nombre de spectateurs distincts — un
    /// titre vu par cinq comptes vaut mieux qu'un titre revu cinq fois par un seul — puis
    /// sur la lecture la plus récente.
    /// </remarks>
    /// <param name="size">Nombre d'entrées conservées.</param>
    /// <returns>Le classement, du rang 1 au rang <paramref name="size"/>.</returns>
    public IReadOnlyList<TopListRanking> Rank(int size)
        => _aggregates.Values
            .OrderByDescending(a => a.Score)
            .ThenByDescending(a => a.Viewers.Count)
            .ThenByDescending(a => a.LastPlayedUtc ?? DateTime.MinValue)
            .Take(Math.Clamp(size, 1, 100))
            .Select((a, index) => new TopListRanking
            {
                Rank = index + 1,
                ItemId = a.ItemId,
                Name = a.Name,
                ProductionYear = a.ProductionYear,
                TmdbId = a.TmdbId,
                ImdbId = a.ImdbId,
                Score = a.Score,
                TotalPlays = a.TotalPlays,
                DistinctViewers = a.Viewers.Count,
                LastPlayedUtc = a.LastPlayedUtc
            })
            .ToArray();

    private sealed class Aggregate
    {
        public Guid ItemId { get; init; }

        public string Name { get; init; } = string.Empty;

        public int? ProductionYear { get; init; }

        public string? TmdbId { get; init; }

        public string? ImdbId { get; init; }

        public double Score { get; set; }

        public int TotalPlays { get; set; }

        public DateTime? LastPlayedUtc { get; set; }

        public HashSet<Guid> Viewers { get; } = new();
    }
}
