using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Configuration;

namespace JellyfinCarouselPlugin.Providers;

/// <summary>
/// Source externe de titres populaires. Une implémentation par base de données tierce.
/// </summary>
public interface ITrendingProvider
{
    /// <summary>
    /// Obtient la source implémentée.
    /// </summary>
    TrendingProviderKind Kind { get; }

    /// <summary>
    /// Récupère les titres les plus populaires du moment.
    /// </summary>
    /// <param name="request">Paramètres de l'interrogation.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>Les titres classés par rang croissant.</returns>
    Task<IReadOnlyList<TrendingTitle>> GetTrendingAsync(TrendingRequest request, CancellationToken cancellationToken);
}
