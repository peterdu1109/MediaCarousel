using JellyfinCarouselPlugin.Configuration;

namespace JellyfinCarouselPlugin.Providers;

/// <summary>
/// Paramètres d'une interrogation d'une source de tendances externe.
/// </summary>
/// <param name="MediaKind">Types de médias demandés.</param>
/// <param name="Limit">Nombre de titres souhaités.</param>
/// <param name="Language">Langue des métadonnées (code BCP-47).</param>
/// <param name="ApiKey">Clé d'API ou identifiant client de la source.</param>
public sealed record TrendingRequest(
    TopListMediaKind MediaKind,
    int Limit,
    string Language,
    string ApiKey);
