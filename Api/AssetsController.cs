using System;
using System.IO;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

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
    /// <remarks>
    /// Le contenu ne change qu'avec la version du plugin : celle-ci sert d'<c>ETag</c>, et
    /// ASP.NET répond alors <c>304 Not Modified</c> aux rechargements suivants au lieu de
    /// retransmettre le script. <c>must-revalidate</c> garantit qu'une mise à jour du plugin
    /// est prise en compte immédiatement plutôt qu'à l'expiration d'un cache.
    /// </remarks>
    /// <response code="200">Le script.</response>
    /// <response code="304">Le script n'a pas changé depuis la dernière requête.</response>
    /// <response code="404">Le script est introuvable dans l'assembly.</response>
    /// <returns>Le contenu JavaScript.</returns>
    [HttpGet("media-carousel.js")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetScript()
    {
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName);

        if (stream is null)
        {
            return NotFound();
        }

        var version = Plugin.Instance?.Version?.ToString() ?? "0";
        Response.Headers.CacheControl = "public, max-age=0, must-revalidate";

        // Cette surcharge gère elle-même If-None-Match et renvoie 304 le cas échéant.
        return File(stream, "application/javascript; charset=utf-8", null, new EntityTagHeaderValue('"' + version + '"'));
    }
}
