using System;
using System.Globalization;
using System.Text.Json;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Règles de l'intégration Seerr — Jellyseerr, Overseerr et leur successeur, qui partagent
/// la même API <c>/api/v1</c>.
/// </summary>
/// <remarks>
/// <para>
/// Cette classe est délibérément sans dépendance à Jellyfin : c'est ce qui permet de la
/// couvrir de tests. Tout ce qui s'y trouve se vérifie sans serveur — la façon de retrouver
/// un compte Seerr, de lire un statut, de construire une demande.
/// </para>
/// <para>
/// Le fonctionnement reprend celui de Jellyfin Enhanced, pour qu'un serveur qui utilise
/// déjà ce plugin n'ait rien de nouveau à comprendre : la clé d'API d'administration reste
/// sur le serveur, et chaque demande part AU NOM du compte Seerr de l'utilisateur, désigné
/// par l'en-tête <c>X-Api-User</c>. Seerr applique alors les droits et les quotas de ce
/// compte-là, pas ceux de l'administrateur.
/// </para>
/// </remarks>
public static class SeerrRules
{
    /// <summary>Type de média Seerr d'un film.</summary>
    public const string Movie = "movie";

    /// <summary>Type de média Seerr d'une série.</summary>
    public const string Tv = "tv";

    /// <summary>Le titre peut être demandé.</summary>
    public const string StateRequest = "request";

    /// <summary>Une demande attend l'approbation d'un administrateur Seerr.</summary>
    public const string StatePending = "pending";

    /// <summary>Le titre a été demandé et approuvé ; il est en cours d'acquisition.</summary>
    public const string StateProcessing = "processing";

    /// <summary>Une partie du titre — des saisons — est disponible.</summary>
    public const string StatePartial = "partial";

    /// <summary>Le titre est disponible.</summary>
    public const string StateAvailable = "available";

    /// <summary>Le titre est sur la liste de blocage de Seerr.</summary>
    public const string StateBlocked = "blocked";

    /// <summary>
    /// Indique si un type de média est l'un de ceux que Seerr connaît.
    /// </summary>
    /// <param name="mediaType">Le type reçu.</param>
    /// <returns><see langword="true"/> pour <c>movie</c> ou <c>tv</c>.</returns>
    public static bool IsMediaType(string? mediaType)
        => string.Equals(mediaType, Movie, StringComparison.Ordinal)
            || string.Equals(mediaType, Tv, StringComparison.Ordinal);

    /// <summary>
    /// Le type Seerr d'un titre, d'après sa nature.
    /// </summary>
    /// <param name="isMovie">Vrai pour un film.</param>
    /// <returns><c>movie</c> ou <c>tv</c>.</returns>
    public static string MediaTypeFor(bool isMovie) => isMovie ? Movie : Tv;

    /// <summary>
    /// L'identifiant Jellyfin tel que Seerr l'enregistre : sans tirets.
    /// </summary>
    /// <param name="jellyfinUserId">Identifiant du compte Jellyfin.</param>
    /// <returns>Les 32 chiffres hexadécimaux, en minuscules.</returns>
    public static string NormalizeJellyfinUserId(Guid jellyfinUserId)
        => jellyfinUserId.ToString("N", CultureInfo.InvariantCulture);

    /// <summary>
    /// Retrouve, dans la liste des comptes Seerr, celui qui est lié à un compte Jellyfin.
    /// </summary>
    /// <remarks>
    /// Seerr lie ses comptes à Jellyfin par <c>jellyfinUserId</c>, renseigné quand
    /// l'administrateur les importe depuis Jellyfin. La comparaison ignore la casse : Seerr
    /// ne garantit pas celle qu'il enregistre.
    /// </remarks>
    /// <param name="usersJson">Réponse de <c>GET /api/v1/user</c>.</param>
    /// <param name="jellyfinUserId">Compte Jellyfin cherché.</param>
    /// <returns>L'identifiant du compte Seerr, ou <see langword="null"/> s'il n'y en a pas.</returns>
    public static int? FindSeerrUserId(string usersJson, Guid jellyfinUserId)
    {
        using var document = JsonDocument.Parse(usersJson);

        if (!document.RootElement.TryGetProperty("results", out var results)
            || results.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var wanted = NormalizeJellyfinUserId(jellyfinUserId);

        foreach (var user in results.EnumerateArray())
        {
            if (user.TryGetProperty("jellyfinUserId", out var linked)
                && linked.ValueKind == JsonValueKind.String
                && string.Equals(linked.GetString()?.Replace("-", string.Empty, StringComparison.Ordinal), wanted, StringComparison.OrdinalIgnoreCase)
                && user.TryGetProperty("id", out var id)
                && id.ValueKind == JsonValueKind.Number)
            {
                return id.GetInt32();
            }
        }

        return null;
    }

    /// <summary>
    /// Lit le statut d'un titre dans la réponse de <c>GET /api/v1/movie/{id}</c> ou
    /// <c>/api/v1/tv/{id}</c>.
    /// </summary>
    /// <remarks>
    /// Un titre que Seerr n'a jamais vu demander n'a pas de <c>mediaInfo</c> : son statut vaut
    /// alors 1, « inconnu », qui se demande.
    /// </remarks>
    /// <param name="mediaJson">La réponse de Seerr.</param>
    /// <returns>Le statut Seerr du titre, de 1 à 7.</returns>
    public static int ReadMediaStatus(string mediaJson)
    {
        using var document = JsonDocument.Parse(mediaJson);

        return document.RootElement.TryGetProperty("mediaInfo", out var info)
            && info.ValueKind == JsonValueKind.Object
            && info.TryGetProperty("status", out var status)
            && status.ValueKind == JsonValueKind.Number
                ? status.GetInt32()
                : 1;
    }

    /// <summary>
    /// Traduit un statut Seerr en état du bouton.
    /// </summary>
    /// <remarks>
    /// Statuts de Seerr : 1 inconnu, 2 en attente, 3 en cours, 4 partiellement disponible,
    /// 5 disponible, 6 bloqué, 7 supprimé. Un titre supprimé redevient demandable, comme un
    /// titre inconnu — c'est aussi le choix de Jellyfin Enhanced.
    /// </remarks>
    /// <param name="mediaStatus">Le statut Seerr.</param>
    /// <returns>L'état du bouton.</returns>
    public static string ToState(int mediaStatus) => mediaStatus switch
    {
        2 => StatePending,
        3 => StateProcessing,
        4 => StatePartial,
        5 => StateAvailable,
        6 => StateBlocked,
        _ => StateRequest
    };

    /// <summary>
    /// Lit l'état qui suit une demande, dans la réponse de <c>POST /api/v1/request</c>.
    /// </summary>
    /// <remarks>
    /// Une demande à approuver porte le statut 1 : le titre attend un administrateur. Toute
    /// autre demande acceptée — approuvée d'office pour un compte qui en a le droit — est en
    /// cours d'acquisition.
    /// </remarks>
    /// <param name="requestJson">La réponse de Seerr.</param>
    /// <returns>L'état du bouton après la demande.</returns>
    public static string ReadStateAfterRequest(string requestJson)
    {
        using var document = JsonDocument.Parse(requestJson);

        return document.RootElement.TryGetProperty("status", out var status)
            && status.ValueKind == JsonValueKind.Number
            && status.GetInt32() == 1
                ? StatePending
                : StateProcessing;
    }

    /// <summary>
    /// Construit le corps d'une demande.
    /// </summary>
    /// <remarks>
    /// Une série est demandée en entier, <c>seasons: "all"</c> — comme le fait la demande
    /// rapide de Jellyfin Enhanced. Choisir ses saisons reste possible depuis Seerr.
    /// </remarks>
    /// <param name="mediaType"><c>movie</c> ou <c>tv</c>.</param>
    /// <param name="tmdbId">Identifiant TMDB du titre.</param>
    /// <returns>Le corps JSON de la demande.</returns>
    public static string BuildRequestBody(string mediaType, int tmdbId)
        => string.Equals(mediaType, Tv, StringComparison.Ordinal)
            ? JsonSerializer.Serialize(new { mediaType, mediaId = tmdbId, seasons = "all" })
            : JsonSerializer.Serialize(new { mediaType, mediaId = tmdbId });

    /// <summary>
    /// Normalise l'adresse de Seerr saisie par l'administrateur.
    /// </summary>
    /// <param name="url">L'adresse saisie.</param>
    /// <returns>L'adresse sans barre finale, ou <see langword="null"/> si elle n'est pas une adresse http(s).</returns>
    public static string? NormalizeBaseUrl(string? url)
    {
        var trimmed = (url ?? string.Empty).Trim().TrimEnd('/');

        return Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
                ? trimmed
                : null;
    }
}
