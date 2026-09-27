using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
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
/// déjà ce plugin retrouve le même bouton au même geste : la clé d'API d'administration
/// reste sur le serveur, et chaque demande part AU NOM du compte Seerr de l'utilisateur,
/// désigné par l'en-tête <c>X-Api-User</c>. Seerr applique alors les droits et les quotas de
/// ce compte-là, pas ceux de l'administrateur. Les états et leur ordre de priorité sont ceux
/// de <c>seerr-status.js</c> et d'<c>analyzeSeasonStatuses</c>, lus dans son code.
/// </para>
/// </remarks>
public static class SeerrRules
{
    /// <summary>Type de média Seerr d'un film.</summary>
    public const string Movie = "movie";

    /// <summary>Type de média Seerr d'une série.</summary>
    public const string Tv = "tv";

    /// <summary>« Demander » : le titre peut être demandé.</summary>
    public const string StateRequest = "request";

    /// <summary>« Demander plus » : série dont des saisons sont disponibles, d'autres pas encore.</summary>
    public const string StateRequestMore = "request-more";

    /// <summary>« Demander manquant » : série partiellement disponible.</summary>
    public const string StateRequestMissing = "request-missing";

    /// <summary>« En attente d'approbation » : une demande attend un administrateur Seerr.</summary>
    public const string StatePending = "pending";

    /// <summary>« Demandé » : la demande est approuvée, rien ne se télécharge encore.</summary>
    public const string StateRequested = "requested";

    /// <summary>« Traitement » : le titre est en cours de téléchargement.</summary>
    public const string StateProcessing = "processing";

    /// <summary>« Partiellement disponible ».</summary>
    public const string StatePartial = "partial";

    /// <summary>« Disponible ».</summary>
    public const string StateAvailable = "available";

    /// <summary>« Bloqué » : le titre est sur la liste de blocage de Seerr.</summary>
    public const string StateBlocked = "blocked";

    /// <summary>« Non demandé » : état d'une saison que personne n'a demandée.</summary>
    public const string StateNotRequested = "not-requested";

    // Statuts de média de Seerr (MediaStatus).
    private const int Unknown = 1;
    private const int Pending = 2;
    private const int Processing = 3;
    private const int PartiallyAvailable = 4;
    private const int Available = 5;
    private const int Blocked = 6;
    private const int Deleted = 7;

    // Statuts d'une demande (MediaRequestStatus) : 1 à approuver, 2 approuvée.
    private const int RequestPendingApproval = 1;
    private const int RequestApproved = 2;

    // Au-delà, une liste de saisons n'est plus une demande plausible.
    private const int MaxSeasons = 200;
    private const int MaxSeasonNumber = 10000;

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
    /// Lit l'état d'un titre dans la réponse de <c>GET /api/v1/movie/{id}</c> ou
    /// <c>/api/v1/tv/{id}</c>.
    /// </summary>
    /// <remarks>
    /// Un titre que Seerr n'a jamais vu demander n'a pas de <c>mediaInfo</c> : il se demande.
    /// L'état d'une série se déduit de ses saisons quand Seerr les détaille — une série dont
    /// une saison est disponible et la suivante absente n'est ni « disponible » ni « à
    /// demander », mais « partiellement disponible ».
    /// </remarks>
    /// <param name="mediaJson">La réponse de Seerr.</param>
    /// <param name="mediaType"><c>movie</c> ou <c>tv</c>.</param>
    /// <param name="includeSpecials">Vrai si Seerr accepte les épisodes spéciaux.</param>
    /// <returns>L'état du bouton.</returns>
    public static string ReadState(string mediaJson, string mediaType, bool includeSpecials = false)
    {
        using var document = JsonDocument.Parse(mediaJson);
        var info = MediaInfo(document.RootElement);
        var status = IntProperty(info, "status") ?? Unknown;

        if (!string.Equals(mediaType, Tv, StringComparison.Ordinal))
        {
            return MovieState(status, Downloads(info).Count > 0);
        }

        var seasons = new List<(int Number, int Status)>();
        if (info is { } media && media.TryGetProperty("seasons", out var list) && list.ValueKind == JsonValueKind.Array)
        {
            foreach (var season in list.EnumerateArray())
            {
                if (IntProperty(season, "seasonNumber") is int number)
                {
                    seasons.Add((number, IntProperty(season, "status") ?? Unknown));
                }
            }
        }

        return seasons.Count == 0 ? TvState(status) : SeasonsState(seasons, includeSpecials);
    }

    /// <summary>
    /// État du bouton d'un film, d'après son statut Seerr.
    /// </summary>
    /// <remarks>
    /// Un film approuvé n'est « en traitement » que si quelque chose se télécharge ; sinon il
    /// est simplement « demandé ». Un film supprimé redevient demandable.
    /// </remarks>
    /// <param name="status">Statut Seerr, de 1 à 7.</param>
    /// <param name="downloading">Vrai si un téléchargement est en cours.</param>
    /// <returns>L'état du bouton.</returns>
    public static string MovieState(int status, bool downloading) => status switch
    {
        Pending => StatePending,
        Processing => downloading ? StateProcessing : StateRequested,
        PartiallyAvailable => StatePartial,
        Available => StateAvailable,
        Blocked => StateBlocked,
        _ => StateRequest
    };

    /// <summary>
    /// État du bouton d'une série dont Seerr ne détaille pas les saisons.
    /// </summary>
    /// <remarks>
    /// Une série « en cours » ou « partiellement disponible » laisse demander ses autres
    /// saisons, comme chez Jellyfin Enhanced.
    /// </remarks>
    /// <param name="status">Statut Seerr de la série.</param>
    /// <returns>L'état du bouton.</returns>
    public static string TvState(int status) => status switch
    {
        Pending => StatePending,
        PartiallyAvailable => StateRequestMissing,
        Available => StateAvailable,
        Blocked => StateBlocked,
        _ => StateRequest
    };

    /// <summary>
    /// État du bouton d'une série, d'après celui de ses saisons.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Tant qu'une saison reste à demander, ce sont les libellés d'<c>analyzeSeasonStatuses</c>
    /// de Jellyfin Enhanced : « Demander », « Demander manquant » quand une partie est
    /// disponible, « Demander plus » quand il ne manque que les épisodes spéciaux.
    /// </para>
    /// <para>
    /// Quand plus aucune ne l'est, le bouton dit l'état réel. Jellyfin Enhanced affiche alors
    /// encore « Demander » — une série dont toutes les saisons venaient d'être demandées
    /// redevenait demandable à l'écran, constaté sur un 12.1 —, en comptant sur ses pastilles
    /// d'état, que ces rangées n'ont pas. Les épisodes spéciaux ne comptent que si Seerr les
    /// accepte : sinon, « Demander plus » n'ouvrirait qu'une liste vide.
    /// </para>
    /// </remarks>
    /// <param name="seasons">Numéro et statut Seerr de chaque saison.</param>
    /// <param name="includeSpecials">Vrai si Seerr accepte les épisodes spéciaux.</param>
    /// <returns>L'état du bouton.</returns>
    public static string SeasonsState(IReadOnlyList<(int Number, int Status)> seasons, bool includeSpecials)
    {
        var regular = seasons.Where(s => s.Number > 0).ToList();
        if (regular.Count == 0)
        {
            return StateRequest;
        }

        var available = regular.Count(s => s.Status == Available);
        var somewhatAvailable = available + regular.Count(s => s.Status == PartiallyAvailable);
        var requestable = regular.Count(s => IsRequestable(s.Status))
            + (includeSpecials && seasons.Any(s => s.Number == 0 && IsRequestable(s.Status)) ? 1 : 0);

        if (requestable > 0)
        {
            if (somewhatAvailable == 0)
            {
                return StateRequest;
            }

            return available == regular.Count ? StateRequestMore : StateRequestMissing;
        }

        if (available == regular.Count)
        {
            return StateAvailable;
        }

        if (somewhatAvailable > 0)
        {
            return StatePartial;
        }

        if (regular.All(s => s.Status == Blocked))
        {
            return StateBlocked;
        }

        // Tout est demandé, rien n'est encore là : approuvé pour une saison au moins, ou en
        // attente d'un administrateur pour toutes.
        return regular.Any(s => s.Status == Processing) ? StateRequested : StatePending;
    }

    /// <summary>
    /// Lit les saisons d'une série dans la réponse de <c>GET /api/v1/tv/{id}</c>.
    /// </summary>
    /// <remarks>
    /// Seules les saisons qui ont des épisodes sont proposées, et les épisodes spéciaux
    /// seulement si Seerr les accepte. Une saison déjà couverte par une demande en cours
    /// n'est plus demandable, même si Seerr ne l'a pas encore reportée sur le média.
    /// </remarks>
    /// <param name="tvJson">La réponse de Seerr.</param>
    /// <param name="includeSpecials">Vrai si Seerr accepte les épisodes spéciaux.</param>
    /// <returns>Les saisons, dans l'ordre.</returns>
    public static IReadOnlyList<SeerrSeason> ReadSeasons(string tvJson, bool includeSpecials)
    {
        using var document = JsonDocument.Parse(tvJson);
        var root = document.RootElement;
        var info = MediaInfo(root);
        var statuses = SeasonStatuses(info);
        var downloading = Downloads(info);
        var result = new List<SeerrSeason>();

        if (root.TryGetProperty("seasons", out var seasons) && seasons.ValueKind == JsonValueKind.Array)
        {
            foreach (var season in seasons.EnumerateArray())
            {
                if (IntProperty(season, "seasonNumber") is not int number
                    || (IntProperty(season, "episodeCount") ?? 0) <= 0
                    || (number == 0 && !includeSpecials))
                {
                    continue;
                }

                var status = statuses.TryGetValue(number, out var known) ? known : Unknown;
                result.Add(new SeerrSeason(
                    number,
                    SeasonName(season),
                    Year(season),
                    IntProperty(season, "episodeCount") ?? 0,
                    SeasonState(status, downloading.Contains(number)),
                    IsRequestable(status)));
            }
        }

        result.Sort((a, b) => a.Number.CompareTo(b.Number));
        return result;
    }

    /// <summary>
    /// Lit, dans <c>GET /api/v1/settings/main</c>, les deux réglages qui décident du choix des
    /// saisons : demandes partielles et épisodes spéciaux.
    /// </summary>
    /// <remarks>
    /// Seuls ces deux booléens sont lus ; la réponse contient aussi la clé d'API de Seerr, qui
    /// n'en sort jamais.
    /// </remarks>
    /// <param name="settingsJson">La réponse de Seerr.</param>
    /// <returns>Les deux réglages ; faux quand ils manquent.</returns>
    public static (bool PartialRequests, bool SpecialEpisodes) ReadRequestSettings(string settingsJson)
    {
        using var document = JsonDocument.Parse(settingsJson);
        var root = document.RootElement;

        return (BoolProperty(root, "partialRequestsEnabled"), BoolProperty(root, "enableSpecialEpisodes"));
    }

    /// <summary>
    /// Valide une liste de saisons à demander.
    /// </summary>
    /// <param name="seasons">Les numéros reçus.</param>
    /// <returns>Les numéros, sans doublon et dans l'ordre, ou <see langword="null"/> si la liste est vide ou invraisemblable.</returns>
    public static IReadOnlyList<int>? NormalizeSeasons(IEnumerable<int>? seasons)
    {
        if (seasons is null)
        {
            return null;
        }

        var list = seasons.Distinct().OrderBy(n => n).ToList();

        return list.Count == 0 || list.Count > MaxSeasons || list.Any(n => n < 0 || n > MaxSeasonNumber)
            ? null
            : list;
    }

    /// <summary>
    /// Construit le corps d'une demande.
    /// </summary>
    /// <remarks>
    /// Une série est demandée saison par saison, celles qu'a cochées l'utilisateur — comme la
    /// fenêtre de saisons de Jellyfin Enhanced.
    /// </remarks>
    /// <param name="mediaType"><c>movie</c> ou <c>tv</c>.</param>
    /// <param name="tmdbId">Identifiant TMDB du titre.</param>
    /// <param name="seasons">Saisons demandées, pour une série.</param>
    /// <returns>Le corps JSON de la demande.</returns>
    /// <param name="choice">Serveur, profil et dossier choisis, quand les options avancées sont proposées.</param>
    public static string BuildRequestBody(string mediaType, int tmdbId, IReadOnlyList<int>? seasons = null, SeerrChoice? choice = null)
    {
        var body = new Dictionary<string, object>(StringComparer.Ordinal)
        {
            ["mediaType"] = mediaType,
            ["mediaId"] = tmdbId
        };

        if (string.Equals(mediaType, Tv, StringComparison.Ordinal))
        {
            body["seasons"] = seasons ?? Array.Empty<int>();
        }

        if (choice is not null)
        {
            body["serverId"] = choice.ServerId;
            body["profileId"] = choice.ProfileId;
            body["rootFolder"] = choice.RootFolder;
        }

        return JsonSerializer.Serialize(body);
    }

    /// <summary>
    /// Le service de Seerr qui reçoit un type de média : Sonarr pour les séries, Radarr pour les films.
    /// </summary>
    /// <param name="mediaType"><c>movie</c> ou <c>tv</c>.</param>
    /// <returns><c>sonarr</c> ou <c>radarr</c>.</returns>
    public static string ServiceFor(string mediaType)
        => string.Equals(mediaType, Tv, StringComparison.Ordinal) ? "sonarr" : "radarr";

    /// <summary>
    /// Lit la liste des serveurs d'un service, <c>GET /api/v1/service/{sonarr|radarr}</c>.
    /// </summary>
    /// <param name="listJson">La réponse de Seerr.</param>
    /// <returns>Les serveurs, sans leurs profils ni leurs dossiers, que donne leur détail.</returns>
    public static IReadOnlyList<SeerrServer> ReadServers(string listJson)
    {
        using var document = JsonDocument.Parse(listJson);
        var servers = new List<SeerrServer>();

        if (document.RootElement.ValueKind != JsonValueKind.Array)
        {
            return servers;
        }

        foreach (var server in document.RootElement.EnumerateArray())
        {
            if (IntProperty(server, "id") is not int id)
            {
                continue;
            }

            servers.Add(new SeerrServer(
                id,
                StringProperty(server, "name") ?? "Serveur " + id.ToString(CultureInfo.InvariantCulture),
                BoolProperty(server, "is4k"),
                BoolProperty(server, "isDefault"),
                IntProperty(server, "activeProfileId"),
                StringProperty(server, "activeDirectory"),
                Array.Empty<SeerrProfile>(),
                Array.Empty<SeerrFolder>()));
        }

        return servers;
    }

    /// <summary>
    /// Lit le détail d'un serveur, <c>GET /api/v1/service/{sonarr|radarr}/{id}</c>.
    /// </summary>
    /// <param name="detailsJson">La réponse de Seerr.</param>
    /// <returns>Les profils de qualité et les dossiers racines du serveur.</returns>
    public static (IReadOnlyList<SeerrProfile> Profiles, IReadOnlyList<SeerrFolder> Folders) ReadServerDetails(string detailsJson)
    {
        using var document = JsonDocument.Parse(detailsJson);
        var root = document.RootElement;
        var profiles = new List<SeerrProfile>();
        var folders = new List<SeerrFolder>();

        if (root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty("profiles", out var profileList)
            && profileList.ValueKind == JsonValueKind.Array)
        {
            foreach (var profile in profileList.EnumerateArray())
            {
                if (IntProperty(profile, "id") is int id)
                {
                    profiles.Add(new SeerrProfile(id, StringProperty(profile, "name") ?? "Profil " + id.ToString(CultureInfo.InvariantCulture)));
                }
            }
        }

        if (root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty("rootFolders", out var folderList)
            && folderList.ValueKind == JsonValueKind.Array)
        {
            foreach (var folder in folderList.EnumerateArray())
            {
                if (StringProperty(folder, "path") is { Length: > 0 } path)
                {
                    long? free = folder.TryGetProperty("freeSpace", out var space) && space.ValueKind == JsonValueKind.Number
                        && space.TryGetInt64(out var bytes) ? bytes : null;
                    folders.Add(new SeerrFolder(path, free));
                }
            }
        }

        return (profiles, folders);
    }

    /// <summary>
    /// Indique si un choix de serveur, de profil et de dossier fait partie de ce que Seerr propose.
    /// </summary>
    /// <remarks>
    /// Seerr transmet ces choix à Sonarr ou Radarr sans les filtrer selon les droits du compte :
    /// sans cette vérification, n'importe quel compte connecté pourrait faire créer un dossier
    /// n'importe où, par une demande portée par la clé d'administration.
    /// </remarks>
    /// <param name="servers">Les serveurs publiés par Seerr, avec leur détail.</param>
    /// <param name="choice">Le choix reçu.</param>
    /// <returns>Vrai si le serveur existe, et que le profil et le dossier sont les siens.</returns>
    public static bool IsAllowedChoice(IReadOnlyList<SeerrServer> servers, SeerrChoice choice)
    {
        var server = servers.FirstOrDefault(s => s.Id == choice.ServerId);

        return server is not null
            && server.Profiles.Any(p => p.Id == choice.ProfileId)
            && server.Folders.Any(f => string.Equals(f.Path, choice.RootFolder, StringComparison.Ordinal));
    }

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

    // Une saison se demande tant que Seerr ne la connaît pas, ou qu'elle a été supprimée.
    private static bool IsRequestable(int status) => status == Unknown || status == Deleted;

    // Statut de chaque saison : celui du média, sinon celui d'une demande en cours. Une
    // demande porte un statut de DEMANDE (1 à approuver, 2 approuvée), traduit ici en statut de
    // média — les confondre rendrait demandable une saison qui attend son approbation.
    private static Dictionary<int, int> SeasonStatuses(JsonElement? info)
    {
        var statuses = new Dictionary<int, int>();

        if (info is not { } media)
        {
            return statuses;
        }

        if (media.TryGetProperty("seasons", out var seasons) && seasons.ValueKind == JsonValueKind.Array)
        {
            foreach (var season in seasons.EnumerateArray())
            {
                if (IntProperty(season, "seasonNumber") is int number && IntProperty(season, "status") is int status)
                {
                    statuses[number] = status;
                }
            }
        }

        if (!media.TryGetProperty("requests", out var requests) || requests.ValueKind != JsonValueKind.Array)
        {
            return statuses;
        }

        foreach (var request in requests.EnumerateArray())
        {
            var requestStatus = IntProperty(request, "status");
            int? asMedia = requestStatus == RequestPendingApproval ? Pending
                : requestStatus == RequestApproved ? Processing
                : null;

            if (asMedia is null
                || !request.TryGetProperty("seasons", out var requested)
                || requested.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var season in requested.EnumerateArray())
            {
                if (IntProperty(season, "seasonNumber") is int number
                    && (!statuses.TryGetValue(number, out var known) || IsRequestable(known)))
                {
                    statuses[number] = asMedia.Value;
                }
            }
        }

        return statuses;
    }

    private static string SeasonState(int status, bool downloading) => status switch
    {
        Pending or Processing => downloading ? StateProcessing : StateRequested,
        PartiallyAvailable => StatePartial,
        Available => StateAvailable,
        Blocked => StateBlocked,
        _ => StateNotRequested
    };

    // TheTVDB nomme parfois une saison par son seul numéro : le client écrit alors « Saison N ».
    private static string? SeasonName(JsonElement season)
    {
        var name = season.TryGetProperty("name", out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim()
            : null;

        return string.IsNullOrEmpty(name) || name.All(char.IsDigit) ? null : name;
    }

    private static string? Year(JsonElement season)
    {
        var date = season.TryGetProperty("airDate", out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

        return date is { Length: >= 4 } && date.Take(4).All(char.IsDigit) ? date[..4] : null;
    }

    private static JsonElement? MediaInfo(JsonElement root)
        => root.TryGetProperty("mediaInfo", out var info) && info.ValueKind == JsonValueKind.Object ? info : null;

    // Saisons dont un épisode se télécharge ; -1 pour un téléchargement sans saison (un film).
    private static HashSet<int> Downloads(JsonElement? info)
    {
        var seasons = new HashSet<int>();

        if (info is { } media && media.TryGetProperty("downloadStatus", out var downloads) && downloads.ValueKind == JsonValueKind.Array)
        {
            foreach (var download in downloads.EnumerateArray())
            {
                var season = download.ValueKind == JsonValueKind.Object
                    && download.TryGetProperty("episode", out var episode)
                    && episode.ValueKind == JsonValueKind.Object
                        ? IntProperty(episode, "seasonNumber")
                        : null;
                seasons.Add(season ?? -1);
            }
        }

        return seasons;
    }

    private static int? IntProperty(JsonElement? element, string name)
        => element is { ValueKind: JsonValueKind.Object } value
            && value.TryGetProperty(name, out var property)
            && property.ValueKind == JsonValueKind.Number
            && property.TryGetInt32(out var number)
                ? number
                : null;

    private static string? StringProperty(JsonElement element, string name)
        => element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(name, out var property)
            && property.ValueKind == JsonValueKind.String
                ? property.GetString()
                : null;

    private static bool BoolProperty(JsonElement element, string name)
        => element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(name, out var property)
            && property.ValueKind == JsonValueKind.True;
}

/// <summary>
/// Un serveur Sonarr ou Radarr déclaré dans Seerr.
/// </summary>
/// <param name="Id">Identifiant du serveur dans Seerr.</param>
/// <param name="Name">Nom donné dans Seerr.</param>
/// <param name="Is4k">Vrai pour le serveur des demandes en 4K.</param>
/// <param name="IsDefault">Vrai pour le serveur par défaut.</param>
/// <param name="ActiveProfileId">Profil de qualité par défaut.</param>
/// <param name="ActiveDirectory">Dossier racine par défaut.</param>
/// <param name="Profiles">Profils de qualité.</param>
/// <param name="Folders">Dossiers racines.</param>
public sealed record SeerrServer(
    int Id,
    string Name,
    bool Is4k,
    bool IsDefault,
    int? ActiveProfileId,
    string? ActiveDirectory,
    IReadOnlyList<SeerrProfile> Profiles,
    IReadOnlyList<SeerrFolder> Folders);

/// <summary>
/// Un profil de qualité.
/// </summary>
/// <param name="Id">Identifiant du profil.</param>
/// <param name="Name">Nom du profil.</param>
public sealed record SeerrProfile(int Id, string Name);

/// <summary>
/// Un dossier racine.
/// </summary>
/// <param name="Path">Chemin du dossier.</param>
/// <param name="FreeSpace">Espace libre, en octets, si Seerr le connaît.</param>
public sealed record SeerrFolder(string Path, long? FreeSpace);

/// <summary>
/// Le choix de serveur, de profil et de dossier d'une demande.
/// </summary>
/// <param name="ServerId">Serveur de destination.</param>
/// <param name="ProfileId">Profil de qualité.</param>
/// <param name="RootFolder">Dossier racine.</param>
public sealed record SeerrChoice(int ServerId, int ProfileId, string RootFolder);

/// <summary>
/// Une saison proposée dans le choix des saisons.
/// </summary>
/// <param name="Number">Numéro de la saison ; 0 pour les épisodes spéciaux.</param>
/// <param name="Name">Nom donné par Seerr, ou <see langword="null"/> s'il n'est qu'un numéro.</param>
/// <param name="Year">Année de diffusion, si connue.</param>
/// <param name="Episodes">Nombre d'épisodes.</param>
/// <param name="State">État de la saison.</param>
/// <param name="Requestable">Vrai si la saison peut être demandée.</param>
public sealed record SeerrSeason(int Number, string? Name, string? Year, int Episodes, string State, bool Requestable);
