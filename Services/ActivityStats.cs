using System;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Dernière activité relevée par le calcul du Top du serveur, pour la page de réglages.
/// </summary>
/// <remarks>
/// Gardée en mémoire seulement : le calcul repart au démarrage du serveur, et la page dit
/// « en attente » d'ici là plutôt que de montrer un chiffre d'une autre fenêtre.
/// </remarks>
public sealed class ActivityStats
{
    private readonly object _lock = new();
    private ActivityReport? _last;

    /// <summary>
    /// Consigne l'activité d'un calcul fondé sur Playback Reporting.
    /// </summary>
    /// <param name="activity">L'activité résumée.</param>
    /// <param name="windowDays">La fenêtre du calcul, en jours.</param>
    public void Record(PlaybackActivity activity, int windowDays)
    {
        lock (_lock)
        {
            _last = new ActivityReport(activity, windowDays, DateTime.UtcNow);
        }
    }

    /// <summary>
    /// Oublie l'activité : le dernier calcul n'a pas pu lire Playback Reporting.
    /// </summary>
    public void Clear()
    {
        lock (_lock)
        {
            _last = null;
        }
    }

    /// <summary>
    /// Renvoie la dernière activité relevée.
    /// </summary>
    /// <returns>L'activité, ou <see langword="null"/> si aucun calcul ne l'a encore relevée.</returns>
    public ActivityReport? Get()
    {
        lock (_lock)
        {
            return _last;
        }
    }
}

/// <summary>
/// Une activité relevée et sa fenêtre.
/// </summary>
/// <param name="Activity">Les chiffres.</param>
/// <param name="WindowDays">La fenêtre, en jours.</param>
/// <param name="ComputedUtc">L'heure du relevé.</param>
public sealed record ActivityReport(PlaybackActivity Activity, int WindowDays, DateTime ComputedUtc);
