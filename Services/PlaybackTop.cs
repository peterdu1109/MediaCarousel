using System;
using System.Collections.Generic;
using System.Linq;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Une lecture relevée par Playback Reporting, déjà rapportée à son titre : le film, ou la série
/// de l'épisode.
/// </summary>
/// <param name="TitleId">Film ou série classé.</param>
/// <param name="UserId">Compte qui a regardé.</param>
/// <param name="Seconds">Durée réellement regardée.</param>
/// <param name="PlayedAt">Moment de la lecture.</param>
public readonly record struct PlaybackView(Guid TitleId, Guid UserId, int Seconds, DateTime PlayedAt);

/// <summary>
/// Un titre classé d'après les vraies lectures.
/// </summary>
/// <param name="TitleId">Film ou série.</param>
/// <param name="Viewers">Comptes qui l'ont regardé au moins <see cref="PlaybackTop.MinSecondsPerViewer"/>.</param>
/// <param name="Seconds">Temps total regardé par ces comptes.</param>
/// <param name="LastPlayed">Dernière lecture.</param>
public readonly record struct PlaybackTitle(Guid TitleId, int Viewers, long Seconds, DateTime LastPlayed);

/// <summary>
/// Classe les titres d'après ce qui a vraiment été regardé.
/// </summary>
/// <remarks>
/// Demandé par Elie le 2026-09-28 : le Top du serveur ne reflétait qu'à moitié la réalité. Il
/// comptait les titres marqués « vu » — un épisode marqué à la main, ou ouvert quelques secondes,
/// valait un vrai spectateur — et ignorait le temps passé. Ici, un compte ne compte que s'il a
/// regardé le titre au moins cinq minutes en tout, et le temps passé départage les ex æquo.
/// </remarks>
public static class PlaybackTop
{
    /// <summary>
    /// Visionnage minimal, par compte et par titre, pour compter comme spectateur.
    /// </summary>
    public const int MinSecondsPerViewer = 300;

    /// <summary>
    /// Classe les titres : spectateurs d'abord, puis temps passé, puis lecture la plus récente.
    /// </summary>
    /// <param name="views">Les lectures, rapportées à leur titre.</param>
    /// <param name="size">Nombre de titres gardés.</param>
    /// <returns>Les titres classés, sans ceux que personne n'a vraiment regardés.</returns>
    public static IReadOnlyList<PlaybackTitle> Rank(IEnumerable<PlaybackView> views, int size)
    {
        ArgumentNullException.ThrowIfNull(views);

        var titles = new Dictionary<Guid, Dictionary<Guid, (long Seconds, DateTime Last)>>();

        foreach (var view in views)
        {
            if (view.Seconds <= 0)
            {
                continue;
            }

            if (!titles.TryGetValue(view.TitleId, out var byUser))
            {
                byUser = new Dictionary<Guid, (long Seconds, DateTime Last)>();
                titles[view.TitleId] = byUser;
            }

            byUser.TryGetValue(view.UserId, out var total);
            byUser[view.UserId] = (total.Seconds + view.Seconds, view.PlayedAt > total.Last ? view.PlayedAt : total.Last);
        }

        return titles
            .Select(title =>
            {
                var viewers = title.Value.Values.Where(v => v.Seconds >= MinSecondsPerViewer).ToArray();
                return new PlaybackTitle(
                    title.Key,
                    viewers.Length,
                    viewers.Sum(v => v.Seconds),
                    viewers.Length == 0 ? DateTime.MinValue : viewers.Max(v => v.Last));
            })
            .Where(title => title.Viewers > 0)
            .OrderByDescending(title => title.Viewers)
            .ThenByDescending(title => title.Seconds)
            .ThenByDescending(title => title.LastPlayed)
            .Take(Math.Max(size, 0))
            .ToArray();
    }
}
