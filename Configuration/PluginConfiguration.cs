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
    /// Obtient ou définit les identifiants des bibliothèques exclues de toutes les rangées :
    /// Top du serveur, « jamais vu », « de retour », studios, genres, et le rapprochement du
    /// Top mondial.
    /// </summary>
    /// <remarks>
    /// Les classements les honorent directement ; les catalogues les sautent lors de leur
    /// balayage par bibliothèque ; <see cref="Services.LibraryTitleIndex"/> ne les indexe pas,
    /// si bien qu'un titre externe d'une bibliothèque exclue apparaît « absent » plutôt que d'y
    /// mener. Le nom de la propriété est historique et conservé : le changer perdrait
    /// silencieusement les valeurs déjà enregistrées dans <c>MediaCarousel.xml</c>.
    /// </remarks>
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
    // Rangées par studio et par genre
    // ------------------------------------------------------------------

    /// <summary>
    /// Obtient ou définit une valeur indiquant si la rangée des studios est affichée.
    /// </summary>
    public bool EnableStudioRow { get; set; } = true;

    /// <summary>
    /// Obtient ou définit le titre de la rangée des studios.
    /// </summary>
    public string StudioRowTitle { get; set; } = "Par studio";

    /// <summary>
    /// Obtient ou définit le nombre de studios affichés.
    /// </summary>
    public int StudioRowSize { get; set; } = 20;

    /// <summary>
    /// Obtient ou définit le nombre minimal de titres pour qu'un studio soit retenu.
    /// </summary>
    public int MinItemsPerStudio { get; set; } = 3;

    /// <summary>
    /// Obtient ou définit une valeur indiquant si des rangées par genre sont affichées.
    /// </summary>
    public bool EnableGenreRows { get; set; } = true;

    /// <summary>
    /// Obtient ou définit le nombre de genres affichés, du plus fourni au moins fourni.
    /// </summary>
    public int GenreRowCount { get; set; } = 6;

    /// <summary>
    /// Obtient ou définit le nombre de titres affichés par rangée de genre.
    /// </summary>
    public int GenreRowItemCount { get; set; } = 20;

    /// <summary>
    /// Obtient ou définit le nombre minimal de titres pour qu'un genre soit retenu.
    /// </summary>
    public int MinItemsPerGenre { get; set; } = 5;

    // ------------------------------------------------------------------
    // Rangées dérivées de la bibliothèque
    // ------------------------------------------------------------------

    /// <summary>
    /// Obtient ou définit une valeur indiquant si la rangée « jamais vu » est affichée :
    /// les films bien notés que personne n'a encore lancés sur le serveur.
    /// </summary>
    public bool EnableNeverPlayedRow { get; set; } = true;

    /// <summary>
    /// Obtient ou définit le titre de la rangée « jamais vu ».
    /// </summary>
    public string NeverPlayedRowTitle { get; set; } = "Jamais vu";

    /// <summary>
    /// Obtient ou définit le nombre de films affichés dans la rangée « jamais vu ».
    /// </summary>
    public int NeverPlayedRowSize { get; set; } = 20;

    /// <summary>
    /// Obtient ou définit la note minimale pour qu'un film jamais lu soit proposé.
    /// </summary>
    public double NeverPlayedMinRating { get; set; } = 7.0;

    /// <summary>
    /// Obtient ou définit une valeur indiquant si la rangée « de retour » est affichée :
    /// les séries dont des épisodes viennent d'être ajoutés.
    /// </summary>
    public bool EnableReturningRow { get; set; } = true;

    /// <summary>
    /// Obtient ou définit le titre de la rangée « de retour ».
    /// </summary>
    public string ReturningRowTitle { get; set; } = "De retour cette semaine";

    /// <summary>
    /// Obtient ou définit la fenêtre, en jours, pendant laquelle un ajout d'épisode
    /// fait remonter sa série.
    /// </summary>
    public int ReturningRowDays { get; set; } = 7;

    /// <summary>
    /// Obtient ou définit le nombre de séries affichées dans la rangée « de retour ».
    /// </summary>
    public int ReturningRowSize { get; set; } = 20;

    /// <summary>
    /// Obtient ou définit une valeur indiquant si la rangée « parce que tu as regardé »
    /// est affichée.
    /// </summary>
    /// <remarks>
    /// Contrairement aux autres rangées, celle-ci est propre à chaque compte et n'est pas
    /// précalculée : le client repère le dernier film terminé par l'utilisateur, puis
    /// demande à l'API native de Jellyfin d'autres titres du même genre.
    /// </remarks>
    public bool EnableBecauseRow { get; set; } = true;

    /// <summary>
    /// Obtient ou définit le gabarit du titre de la rangée « parce que tu as regardé ».
    /// </summary>
    /// <remarks>
    /// La séquence <c>{0}</c> est remplacée par le titre du film servant de point de départ.
    /// Un gabarit sans <c>{0}</c> reste affiché tel quel.
    /// </remarks>
    public string BecauseRowTitle { get; set; } = "Parce que tu as regardé {0}";

    /// <summary>
    /// Obtient ou définit le nombre de titres affichés dans la rangée « parce que tu as regardé ».
    /// </summary>
    public int BecauseRowSize { get; set; } = 20;

    // ------------------------------------------------------------------
    // Rafraîchissement et exposition
    // ------------------------------------------------------------------

    /// <summary>
    /// Obtient ou définit l'intervalle de recalcul automatique, en heures.
    /// </summary>
    public int RefreshIntervalHours { get; set; } = 6;

    /// <summary>
    /// Obtient ou définit l'ordre des rangées sur la page d'accueil, identifiants séparés
    /// par des virgules.
    /// </summary>
    /// <remarks>
    /// Identifiants reconnus : <c>local</c>, <c>global</c>, <c>returning</c>,
    /// <c>neverplayed</c>, <c>because</c>, <c>studios</c>, <c>genres</c>. Le client ignore
    /// les identifiants inconnus et ajoute en fin les rangées absentes de la liste : une
    /// valeur d'une version précédente reste valable quand une rangée nouvelle apparaît.
    /// </remarks>
    public string RowOrder { get; set; } = "local,global,returning,neverplayed,because,studios,genres";

    /// <summary>
    /// Obtient ou définit une valeur indiquant si les classements sont affichés directement
    /// sur la page d'accueil, sous les bibliothèques, sous forme de rangées façon Netflix.
    /// </summary>
    /// <remarks>
    /// Jellyfin ne propose aucun point d'extension serveur pour la page d'accueil : ses sections
    /// sont une énumération fermée rendue par le client web. Le plugin injecte donc un script
    /// autonome dans <c>index.html</c>, automatiquement, sans intervention de l'administrateur.
    /// </remarks>
    public bool EnableHomeRows { get; set; } = true;

    /// <summary>
    /// Obtient ou définit le titre de la rangée du Top local sur la page d'accueil.
    /// </summary>
    public string LocalRowTitle { get; set; } = "Top 10 sur ce serveur";

    /// <summary>
    /// Obtient ou définit le titre de la rangée du Top mondial sur la page d'accueil.
    /// </summary>
    public string GlobalRowTitle { get; set; } = "Top 10 mondial";

    /// <summary>
    /// Obtient ou définit la couleur d'accentuation des rangées (hexadécimal).
    /// </summary>
    public string HighlightColor { get; set; } = "#775BF4";

    /// <summary>
    /// Obtient ou définit une valeur indiquant si les sections natives de Jellyfin
    /// (derniers ajouts, reprise de lecture, prochainement…) sont masquées sur la page
    /// d'accueil, pour ne laisser que les bibliothèques et les rangées du plugin.
    /// </summary>
    /// <remarks>
    /// Désactivé par défaut : ce réglage modifie la page d'accueil de tous les comptes du
    /// serveur, et les sections natives restent configurables par utilisateur dans Jellyfin.
    /// </remarks>
    public bool HideNativeHomeSections { get; set; }

    /// <summary>
    /// Obtient ou définit une valeur indiquant si les classements sont aussi matérialisés
    /// en collections Jellyfin, pour les clients qui n'exécutent pas le script (Kodi, Android TV).
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
