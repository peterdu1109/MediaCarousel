using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Règles d'appel d'une source de tendances : délai, nouvelle tentative, réponse vide.
/// </summary>
/// <remarks>
/// Isolées du constructeur du Top mondial pour être éprouvées sans serveur Jellyfin.
/// </remarks>
public static class TrendingFetch
{
    /// <summary>
    /// Appelle la source avec un délai maximal, et une seule nouvelle tentative sur une erreur
    /// réseau ou un délai dépassé.
    /// </summary>
    /// <remarks>
    /// Un délai dépassé se signale par une annulation, la même exception qu'un arrêt demandé.
    /// Au second échec, elle remontait telle quelle, et le recalcul la prenait pour un arrêt :
    /// tout le passage s'interrompait — « jamais vu », studios, genres et purge des affiches
    /// compris — sans rien noter au bilan. Elle devient donc une <see cref="TimeoutException"/>,
    /// un échec ordinaire de la seule section concernée.
    /// </remarks>
    /// <typeparam name="T">Le type de la réponse.</typeparam>
    /// <param name="call">L'appel, qui reçoit le jeton borné par le délai.</param>
    /// <param name="timeout">Le délai d'un essai.</param>
    /// <param name="retryDelay">L'attente avant le second essai.</param>
    /// <param name="onRetry">Prévenu de l'échec du premier essai.</param>
    /// <param name="cancellationToken">L'arrêt demandé par l'appelant.</param>
    /// <returns>La réponse de la source.</returns>
    public static async Task<T> WithRetryAsync<T>(
        Func<CancellationToken, Task<T>> call,
        TimeSpan timeout,
        TimeSpan retryDelay,
        Action<Exception>? onRetry,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(call);

        for (var attempt = 1; ; attempt++)
        {
            using var bounded = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            bounded.CancelAfter(timeout);

            try
            {
                return await call(bounded.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex) when (attempt == 1 && ex is HttpRequestException or OperationCanceledException)
            {
                onRetry?.Invoke(ex);
                await Task.Delay(retryDelay, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException ex)
            {
                throw new TimeoutException(
                    $"La source n'a pas répondu en {timeout.TotalSeconds:0} s, deux fois de suite.", ex);
            }
        }
    }

    /// <summary>
    /// Dit si une liste vide est la réponse normale de la source.
    /// </summary>
    /// <remarks>
    /// Seul TMDB distingue les listes, et il n'a pas de « prochaines sorties » pour les séries.
    /// Partout ailleurs, une liste vide est une panne : la publier effaçait le Top mondial, au
    /// lieu de garder le précédent comme pour toute autre erreur.
    /// </remarks>
    /// <param name="tmdb">La source est TMDB.</param>
    /// <param name="upcoming">La liste demandée est « prochaines sorties ».</param>
    /// <param name="seriesOnly">Seules des séries sont demandées.</param>
    /// <returns><see langword="true"/> si le vide est attendu.</returns>
    public static bool EmptyIsExpected(bool tmdb, bool upcoming, bool seriesOnly)
        => tmdb && upcoming && seriesOnly;
}
