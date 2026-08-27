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
}
