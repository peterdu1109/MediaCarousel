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
        var assemblyLocation = Assembly.GetExecutingAssembly().Location;
        var directory = Path.GetDirectoryName(assemblyLocation);
        var scriptPath = directory != null ? Path.Combine(directory, "Web", "carousel-layout.js") : string.Empty;

        if (string.IsNullOrEmpty(scriptPath) || !System.IO.File.Exists(scriptPath))
        {
            return NotFound("carousel-layout.js introuvable sur le disque.");
        }

        return PhysicalFile(scriptPath, "application/javascript");
    }
}
