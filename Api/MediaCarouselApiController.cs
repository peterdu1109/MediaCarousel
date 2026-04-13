using System.IO;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Contrôleur API pour servir le fichier javascript statique de manière fiable, 
/// quel que soit le nom du dossier généré par l'installation du plugin.
/// </summary>
[ApiController]
[Route("MediaCarousel")]
public class MediaCarouselApiController : ControllerBase
{
    /// <summary>
    /// Retourne le contenu du script JS du carousel de manière brute.
    /// </summary>
    /// <returns>Fichier application/javascript</returns>
    [HttpGet("carousel-layout.js")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    public ActionResult GetScript()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = "JellyfinCarouselPlugin.Web.carousel-layout.js";

        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            return NotFound("carousel-layout.js introuvable dans les ressources embarquées.");
        }

        using var reader = new StreamReader(stream);
        var content = reader.ReadToEnd();
        return Content(content, "application/javascript");
    }
}
