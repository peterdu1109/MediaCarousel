using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Conserve les catalogues agrégés (studios, genres) calculés par la tâche planifiée.
/// </summary>
public interface ICatalogStore
{
    /// <summary>
    /// Obtient le dernier catalogue publié.
    /// </summary>
    /// <param name="kind">Nature du catalogue.</param>
    /// <returns>Le catalogue courant, éventuellement vide.</returns>
    CatalogSnapshot Get(CatalogKind kind);

    /// <summary>
    /// Publie un nouveau catalogue, en remplacement du précédent.
    /// </summary>
    /// <param name="snapshot">Le catalogue à publier.</param>
    void Publish(CatalogSnapshot snapshot);
}
