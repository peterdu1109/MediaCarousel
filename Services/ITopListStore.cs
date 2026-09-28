using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Conserve le dernier instantané calculé de chaque classement.
/// Les lectures sont sans verrou : les requêtes HTTP ne recalculent jamais rien.
/// </summary>
public interface ITopListStore
{
    /// <summary>
    /// Obtient le dernier instantané publié pour un classement.
    /// </summary>
    /// <param name="kind">Nature du classement.</param>
    /// <returns>L'instantané courant, éventuellement vide.</returns>
    TopListSnapshot Get(TopListKind kind);

    /// <summary>
    /// Publie un nouvel instantané, en remplacement du précédent.
    /// </summary>
    /// <param name="snapshot">L'instantané à publier.</param>
    void Publish(TopListSnapshot snapshot);

    /// <summary>
    /// Remplace un instantané seulement s'il est toujours celui publié : une correction
    /// calculée à partir d'un instantané périmé n'écrase jamais un recalcul plus récent.
    /// </summary>
    /// <param name="expected">L'instantané à partir duquel le remplaçant a été calculé.</param>
    /// <param name="replacement">Le remplaçant, de même nature.</param>
    /// <returns><c>true</c> si le remplacement a eu lieu.</returns>
    bool TryReplace(TopListSnapshot expected, TopListSnapshot replacement);
}
