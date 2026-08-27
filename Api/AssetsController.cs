using System;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Sert le script de la page d'accueil depuis les ressources embarquées.
/// </summary>
/// <remarks>
/// Le script est servi par un contrôleur plutôt que depuis le dossier du plugin : le nom de ce
/// dossier dépend de l'installation, alors qu'une route est stable. L'accès est anonyme car une
/// balise <c>&lt;script src&gt;</c> ne transmet aucun en-tête d'authentification ; le script ne
/// contient aucune donnée sensible et toutes les données qu'il consomme restent authentifiées.
/// </remarks>
[ApiController]
[Route("MediaCarousel")]
public class AssetsController : ControllerBase
{
    private const string ResourceName = "JellyfinCarouselPlugin.Web.media-carousel.js";

    /// <summary>
    /// Renvoie le script de rendu des rangées de la page d'accueil.
    /// </summary>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <response code="200">Le script.</response>
    /// <response code="404">Le script est introuvable dans l'assembly.</response>
    /// <returns>Le contenu JavaScript.</returns>
    [HttpGet("media-carousel.js")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> GetScript(CancellationToken cancellationToken)
    {
        var assembly = Assembly.GetExecutingAssembly();
        await using var stream = assembly.GetManifestResourceStream(ResourceName);

        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        var content = await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false);

        // La version du plugin sert de clé de cache : un déploiement invalide l'ancien script.
        var version = Plugin.Instance?.Version?.ToString() ?? "0";
        Response.Headers.ETag = "\"" + version + "\"";

        return Content(content, "application/javascript; charset=utf-8");
    }
}
