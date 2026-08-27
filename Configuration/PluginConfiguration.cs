using System;
using MediaBrowser.Model.Plugins;

namespace JellyfinCarouselPlugin.Configuration;

/// <summary>
/// Fournisseur de tendances externes utilisable pour le Top global.
/// </summary>
public enum TrendingProviderKind
{
    /// <summary>The Movie Database (https://www.themoviedb.org).</summary>
    Tmdb = 0,

    /// <summary>Trakt (https://trakt.tv).</summary>
    Trakt = 1
}

/// <summary>
/// Type de médias pris en compte par un classement.
/// </summary>
public enum TopListMediaKind
{
    /// <summary>Films uniquement.</summary>
    Movies = 0,

    /// <summary>Séries uniquement.</summary>
    Series = 1,

    /// <summary>Films et séries.</summary>
    Both = 2
}

/// <summary>
/// Configuration du plugin MediaCarousel.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    // ------------------------------------------------------------------
    // Top 10 local (statistiques de lecture du serveur)
    // ------------------------------------------------------------------

    /// <summary>
    /// Obtient ou définit une valeur indiquant si le Top local est calculé.
    /// </summary>
    public bool EnableLocalTop { get; set; } = true;

    /// <summary>
    /// Obtient ou définit le nombre d'entrées conservées dans le Top local.
    /// </summary>
    public int LocalTopSize { get; set; } = 10;

    /// <summary>
    /// Obtient ou définit les types de médias classés dans le Top local.
    /// </summary>
    public TopListMediaKind LocalTopMediaKind { get; set; } = TopListMediaKind.Both;

    /// <summary>
    /// Obtient ou définit la fenêtre d'observation en jours (0 = depuis toujours).
    /// Une fenêtre courte produit un classement « tendance », une fenêtre nulle un palmarès historique.
    /// </summary>
    public int LocalTopWindowDays { get; set; } = 30;

    /// <summary>
    /// Obtient ou définit le nombre maximal de lectures comptabilisées par utilisateur et par titre.
    /// Empêche qu'un seul utilisateur qui revoit un film 40 fois écrase le classement. 0 = pas de plafond.
    /// </summary>
    public int MaxPlaysCountedPerUser { get; set; } = 3;

    /// <summary>
    /// Obtient ou définit le nombre de titres candidats extraits par utilisateur avant agrégation.
    /// Plus la valeur est haute, plus le classement est exact et plus le calcul est long.
    /// </summary>
    public int CandidatesPerUser { get; set; } = 100;

    /// <summary>
    /// Obtient ou définit les identifiants des utilisateurs exclus du calcul (comptes de service, invités).
    /// </summary>
    public string[] ExcludedUserIds { get; set; } = Array.Empty<string>();

    /// <summary>
    /// Obtient ou définit les identifiants des bibliothèques exclues des classements.
    /// </summary>
    public string[] ExcludedLibraryIds { get; set; } = Array.Empty<string>();

    // ------------------------------------------------------------------
    // Top 10 global (base de données externe)
    // ------------------------------------------------------------------

    /// <summary>
    /// Obtient ou définit une valeur indiquant si le Top global est récupéré.
    /// </summary>
    public bool EnableGlobalTop { get; set; }

    /// <summary>
    /// Obtient ou définit le fournisseur de tendances externe.
    /// </summary>
    public TrendingProviderKind GlobalTopProvider { get; set; } = TrendingProviderKind.Tmdb;

    /// <summary>
    /// Obtient ou définit la clé d'API du fournisseur.
    /// TMDB : clé v3 ou jeton d'accès v4. Trakt : identifiant client.
    /// </summary>
    public string GlobalTopApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Obtient ou définit les types de médias classés dans le Top global.
    /// </summary>
    public TopListMediaKind GlobalTopMediaKind { get; set; } = TopListMediaKind.Movies;

    /// <summary>
    /// Obtient ou définit le nombre d'entrées conservées dans le Top global.
    /// </summary>
    public int GlobalTopSize { get; set; } = 10;

    /// <summary>
    /// Obtient ou définit une valeur indiquant si seuls les titres présents dans la bibliothèque
    /// sont conservés dans le Top global.
    /// </summary>
    public bool GlobalTopLibraryOnly { get; set; } = true;

    /// <summary>
    /// Obtient ou définit la langue des métadonnées demandées au fournisseur (code BCP-47).
    /// </summary>
    public string MetadataLanguage { get; set; } = "fr-FR";

    // ------------------------------------------------------------------
    // Rafraîchissement et exposition
    // ------------------------------------------------------------------

    /// <summary>
    /// Obtient ou définit l'intervalle de recalcul automatique, en heures.
    /// </summary>
    public int RefreshIntervalHours { get; set; } = 6;

    /// <summary>
    /// Obtient ou définit une valeur indiquant si les classements sont matérialisés
    /// en collections Jellyfin, seule façon de les rendre visibles sans modifier le client.
    /// </summary>
    public bool SyncCollections { get; set; }

    /// <summary>
    /// Obtient ou définit le nom de la collection du Top local.
    /// </summary>
    public string LocalCollectionName { get; set; } = "Top 10 du serveur";

    /// <summary>
    /// Obtient ou définit le nom de la collection du Top global.
    /// </summary>
    public string GlobalCollectionName { get; set; } = "Top 10 mondial";

    /// <summary>
    /// Obtient ou définit l'identifiant de la collection du Top local, mémorisé après création.
    /// Champ technique, non exposé dans la page de configuration.
    /// </summary>
    public string LocalCollectionId { get; set; } = string.Empty;

    /// <summary>
    /// Obtient ou définit l'identifiant de la collection du Top global, mémorisé après création.
    /// Champ technique, non exposé dans la page de configuration.
    /// </summary>
    public string GlobalCollectionId { get; set; } = string.Empty;
}
