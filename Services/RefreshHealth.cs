using System;
using System.Collections.Generic;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Bilan du dernier recalcul : durée, horodatage et échecs par section.
/// </summary>
/// <remarks>
/// <para>
/// Ce bilan existe parce que la tolérance aux pannes rend les échecs invisibles :
/// <see cref="TopListRefreshService"/> conserve volontairement l'instantané précédent quand
/// un calcul échoue, si bien qu'une clé TMDB expirée laisse une rangée d'apparence normale
/// dont la date vieillit sans que personne ne le remarque. Chaque échec rattrapé est donc
/// consigné ici, et la page de configuration le montre.
/// </para>
/// <para>
/// La durée sert aussi de mesure : avant d'optimiser le balayage des catalogues ou le
/// classement, on regarde ce que le recalcul coûte réellement — pas ce qu'on suppose.
/// </para>
/// <para>
/// Le bilan vit en mémoire : un redémarrage le remet à zéro, comme il remet à zéro tout ce
/// qu'il décrit. Les instantanés, eux, sont persistés par <see cref="SnapshotStorage"/>.
/// </para>
/// </remarks>
public sealed class RefreshHealth
{
    private readonly object _lock = new();
    private readonly List<RefreshFailure> _currentFailures = new();
    private RefreshReport _lastReport = RefreshReport.Never;
    private DateTime? _runningSinceUtc;

    /// <summary>
    /// Marque le début d'un recalcul.
    /// </summary>
    public void BeginRun()
    {
        lock (_lock)
        {
            _runningSinceUtc = DateTime.UtcNow;
            _currentFailures.Clear();
        }
    }

    /// <summary>
    /// Consigne l'échec d'une section pendant le recalcul en cours.
    /// </summary>
    /// <param name="section">Nom lisible de la section — « Top mondial », « catalogues »…</param>
    /// <param name="exception">Erreur rattrapée.</param>
    public void RecordFailure(string section, Exception exception)
    {
        lock (_lock)
        {
            // Le message suffit : la pile complète est déjà dans le journal du serveur.
            _currentFailures.Add(new RefreshFailure(section, exception.Message));
        }
    }

    /// <summary>
    /// Clôt le recalcul en cours et fige son bilan.
    /// </summary>
    public void EndRun()
    {
        lock (_lock)
        {
            var started = _runningSinceUtc ?? DateTime.UtcNow;
            _lastReport = new RefreshReport(
                started,
                (DateTime.UtcNow - started).TotalSeconds,
                _currentFailures.ToArray());
            _runningSinceUtc = null;
            _currentFailures.Clear();
        }
    }

    /// <summary>
    /// Renvoie le bilan du dernier recalcul achevé, et si un recalcul est en cours.
    /// </summary>
    /// <returns>Le bilan figé et l'état d'exécution.</returns>
    public (RefreshReport Report, bool Running) Snapshot()
    {
        lock (_lock)
        {
            return (_lastReport, _runningSinceUtc.HasValue);
        }
    }
}

/// <summary>
/// L'échec d'une section pendant un recalcul.
/// </summary>
/// <param name="Section">Nom lisible de la section.</param>
/// <param name="Message">Message de l'erreur rattrapée.</param>
public readonly record struct RefreshFailure(string Section, string Message);

/// <summary>
/// Bilan figé d'un recalcul achevé.
/// </summary>
/// <param name="StartedUtc">Début du recalcul (UTC), ou <see langword="null"/> si aucun n'a eu lieu.</param>
/// <param name="DurationSeconds">Durée totale, en secondes.</param>
/// <param name="Failures">Sections en échec ; vide quand tout a réussi.</param>
public sealed record RefreshReport(
    DateTime? StartedUtc,
    double? DurationSeconds,
    IReadOnlyList<RefreshFailure> Failures)
{
    /// <summary>
    /// Obtient le bilan « aucun recalcul n'a encore eu lieu ».
    /// </summary>
    public static RefreshReport Never { get; } = new(null, null, Array.Empty<RefreshFailure>());
}
