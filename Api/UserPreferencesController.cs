using System;
using System.Linq;
using JellyfinCarouselPlugin.Configuration;
using JellyfinCarouselPlugin.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Laisse chaque compte régler ses propres rangées.
/// </summary>
/// <remarks>
/// <para>
/// La page de configuration du plugin vit dans le tableau de bord : elle est réservée aux
/// administrateurs, et rien de ce qu'elle contient n'est atteignable par un utilisateur
/// standard. C'est pourquoi ces trois routes existent — elles sont le seul moyen pour un
/// compte ordinaire de choisir ses rangées, depuis le panneau que le script ouvre sur la
/// page d'accueil.
/// </para>
/// <para>
/// <b>Le compte concerné est toujours celui du jeton</b>, jamais un paramètre : accepter un
/// identifiant laisserait n'importe qui lire — et réécrire — les préférences d'un autre. Un
/// appel par clé d'API, qui ne porte aucun utilisateur, n'a donc pas de préférences à lire.
/// </para>
/// </remarks>
[ApiController]
[Authorize]
[Route("MediaCarousel")]
[Produces("application/json")]
public class UserPreferencesController : ControllerBase
{
    /// <summary>Nom du claim portant l'identifiant de l'utilisateur authentifié.</summary>
    private const string UserIdClaim = "Jellyfin-UserId";

    private readonly UserPreferenceStore _store;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="UserPreferencesController"/>.
    /// </summary>
    /// <param name="store">Stockage des préférences.</param>
    public UserPreferencesController(UserPreferenceStore store)
    {
        _store = store;
    }

    /// <summary>
    /// Renvoie les choix propres à l'appelant.
    /// </summary>
    /// <remarks>
    /// Ce sont les choix <b>bruts</b>, avec leurs <c>null</c> : le panneau doit pouvoir
    /// distinguer « je suis les réglages du serveur » de « j'ai choisi la même valeur ».
    /// Les valeurs effectives, elles, viennent de <c>ClientOptions</c>.
    /// </remarks>
    /// <response code="200">Les choix de l'appelant.</response>
    /// <returns>Les préférences, et si le serveur les autorise.</returns>
    [HttpGet("UserPreferences")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<UserPreferencesDto> GetPreferences()
    {
        var userId = ResolveUserId();

        return Ok(new UserPreferencesDto
        {
            Allowed = AreAllowed(),
            HasPreferences = userId != Guid.Empty && _store.Get(userId) is not null,
            Preferences = userId == Guid.Empty ? null : _store.Get(userId)
        });
    }

    /// <summary>
    /// Enregistre les choix de l'appelant.
    /// </summary>
    /// <param name="preferences">Les choix à conserver.</param>
    /// <response code="200">Les choix retenus après validation.</response>
    /// <response code="403">L'administrateur a désactivé la personnalisation.</response>
    /// <returns>Les préférences telles qu'elles ont été retenues.</returns>
    [HttpPost("UserPreferences")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public ActionResult<UserPreferencesDto> SavePreferences([FromBody] UserRowPreferences? preferences)
    {
        if (!AreAllowed())
        {
            return Forbid();
        }

        var userId = ResolveUserId();

        if (userId == Guid.Empty)
        {
            return Forbid();
        }

        // Le résultat de la validation est enregistré, jamais l'objet reçu.
        var clean = UserPreferenceRules.Sanitize(preferences);
        _store.Save(userId, clean);

        return Ok(new UserPreferencesDto
        {
            Allowed = true,
            HasPreferences = clean is not null,
            Preferences = clean
        });
    }

    /// <summary>
    /// Efface les choix de l'appelant, qui suit de nouveau les réglages du serveur.
    /// </summary>
    /// <response code="204">Les choix ont été effacés.</response>
    /// <returns>Un statut sans contenu.</returns>
    [HttpDelete("UserPreferences")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public ActionResult DeletePreferences()
    {
        var userId = ResolveUserId();

        if (userId != Guid.Empty)
        {
            _store.Save(userId, null);
        }

        return NoContent();
    }

    private static bool AreAllowed() => Plugin.Instance?.Configuration.AllowUserPreferences ?? false;

    private Guid ResolveUserId()
    {
        var claim = User.Claims
            .FirstOrDefault(c => string.Equals(c.Type, UserIdClaim, StringComparison.OrdinalIgnoreCase))?.Value;

        return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
    }
}

/// <summary>
/// Réponse des routes de préférences.
/// </summary>
public sealed class UserPreferencesDto
{
    /// <summary>Obtient ou définit une valeur indiquant si le serveur autorise la personnalisation.</summary>
    public bool Allowed { get; set; }

    /// <summary>Obtient ou définit une valeur indiquant si l'appelant a déjà fait un choix.</summary>
    public bool HasPreferences { get; set; }

    /// <summary>Obtient ou définit les choix de l'appelant, ou <see langword="null"/>.</summary>
    public UserRowPreferences? Preferences { get; set; }
}
