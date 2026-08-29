using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.Services;
using MediaBrowser.Common.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Relaie et met en cache les affiches des titres absents de la bibliothèque.
/// </summary>
/// <remarks>
/// <para>
/// Sans ce relais, le navigateur de chaque utilisateur télécharge l'affiche directement
/// depuis TMDB : leur adresse IP est alors communiquée à un tiers, et un client sans accès
/// Internet sortant n'affiche aucune image. Le serveur télécharge donc une fois, met en
/// cache, et sert ensuite depuis le disque.
/// </para>
/// <para>
/// L'accès est anonyme parce qu'une balise <c>&lt;img src&gt;</c> ne transmet aucun en-tête
/// d'authentification — même raison que pour le script. Ce que la route expose est une
/// affiche publique de TMDB : aucune donnée du serveur n'y transite, et le nom de fichier
/// demandé est validé avant d'être utilisé.
/// </para>
/// </remarks>
[ApiController]
[Route("MediaCarousel")]
public class PosterController : ControllerBase
{
    /// <summary>
    /// Au-delà de cette taille, la réponse n'est pas une affiche : elle est ignorée.
    /// </summary>
    private const int MaxBytes = 5 * 1024 * 1024;

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ITopListStore _store;
    private readonly ILogger<PosterController> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="PosterController"/>.
    /// </summary>
    /// <param name="httpClientFactory">Fabrique de clients HTTP.</param>
    /// <param name="store">Stockage des instantanés, qui fait office de liste blanche.</param>
    /// <param name="logger">Journal.</param>
    public PosterController(
        IHttpClientFactory httpClientFactory,
        ITopListStore store,
        ILogger<PosterController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _store = store;
        _logger = logger;
    }

    /// <summary>
    /// Renvoie une affiche, depuis le cache disque ou depuis TMDB.
    /// </summary>
    /// <param name="fileName">Nom du fichier d'affiche.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <response code="200">L'affiche.</response>
    /// <response code="304">L'affiche n'a pas changé depuis la dernière requête.</response>
    /// <response code="400">Le nom de fichier demandé n'est pas acceptable.</response>
    /// <response code="404">L'affiche est introuvable.</response>
    /// <returns>Le contenu de l'image.</returns>
    [HttpGet("Poster/{fileName}")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> GetPoster(string fileName, CancellationToken cancellationToken)
    {
        if (!PosterProxy.IsValidFileName(fileName))
        {
            return BadRequest();
        }

        // La route reste anonyme, et doit le rester : une requête partie d'un `background-image`
        // ne porte aucun en-tête d'authentification, comme l'explique la remarque de classe.
        // Ce qui est fermé ici, c'est l'AMPLIFICATION : sans cette liste blanche, n'importe qui
        // pouvait faire télécharger au serveur — puis écrire sur son disque — tout nom
        // syntaxiquement valide, la purge ne passant qu'au recalcul et seulement au-delà de
        // trente jours sans accès. Un nom absent des instantanés ne déclenche plus rien.
        if (!IsPublished(fileName))
        {
            return NotFound();
        }

        var cached = ResolveCachePath(fileName);

        if (cached is not null && System.IO.File.Exists(cached))
        {
            // La purge du cache se fonde sur la date d'accès, que les systèmes montés en
            // noatime ne maintiennent pas : elle est posée ici, à chaque service.
            try
            {
                System.IO.File.SetLastAccessTimeUtc(cached, DateTime.UtcNow);
            }
            catch (IOException)
            {
                // Un horodatage qui ne se pose pas ne vaut pas de priver l'appelant de l'image.
            }

            return ServeFile(cached, fileName);
        }

        var bytes = await DownloadAsync(fileName, cancellationToken).ConfigureAwait(false);
        if (bytes is null)
        {
            return NotFound();
        }

        if (cached is not null)
        {
            await WriteCacheAsync(cached, bytes, cancellationToken).ConfigureAwait(false);
        }

        return ServeBytes(bytes, fileName);
    }

    /// <summary>
    /// Indique si une affiche est référencée par un instantané publié.
    /// </summary>
    /// <remarks>
    /// Le balayage porte sur quelques centaines d'entrées au plus — les instantanés sont
    /// plafonnés à cent — donc bien moins cher que de servir le fichier qui suit.
    /// </remarks>
    private bool IsPublished(string fileName)
    {
        foreach (var kind in Enum.GetValues<TopListKind>())
        {
            foreach (var entry in _store.Get(kind).Entries)
            {
                if (PosterProxy.TryGetFileName(entry.PosterUrl, out var published)
                    && string.Equals(published, fileName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }

        return false;
    }

    /// <summary>
    /// Le nom de fichier TMDB identifie son contenu : il fait un ETag stable et permanent.
    /// </summary>
    private ActionResult ServeFile(string path, string fileName)
    {
        Response.Headers.CacheControl = "public, max-age=604800";
        return PhysicalFile(path, ContentTypeFor(fileName), null, new EntityTagHeaderValue('"' + fileName + '"'));
    }

    private ActionResult ServeBytes(byte[] bytes, string fileName)
    {
        Response.Headers.CacheControl = "public, max-age=604800";
        return File(bytes, ContentTypeFor(fileName), null, new EntityTagHeaderValue('"' + fileName + '"'));
    }

    private async Task<byte[]?> DownloadAsync(string fileName, CancellationToken cancellationToken)
    {
        try
        {
            var client = _httpClientFactory.CreateClient(NamedClient.Default);
            client.Timeout = TimeSpan.FromSeconds(30);

            using var response = await client
                .GetAsync(PosterProxy.BuildRemoteUrl(fileName), cancellationToken)
                .ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            if (response.Content.Headers.ContentLength > MaxBytes)
            {
                _logger.LogWarning("Affiche {FileName} ignorée : taille annoncée hors limite.", fileName);
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
            return bytes.Length is > 0 and <= MaxBytes ? bytes : null;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Une affiche manquante n'est pas une panne : la vignette retombe sur le titre.
            _logger.LogDebug(ex, "Échec du téléchargement de l'affiche {FileName}.", fileName);
            return null;
        }
    }

    /// <summary>
    /// Écrit l'affiche dans le cache, par fichier temporaire puis déplacement.
    /// </summary>
    /// <remarks>
    /// Deux requêtes simultanées sur la même affiche la téléchargent chacune ; le
    /// déplacement atomique fait qu'aucune ne peut en lire une version partielle.
    /// </remarks>
    private async Task WriteCacheAsync(string path, byte[] bytes, CancellationToken cancellationToken)
    {
        try
        {
            var directory = Path.GetDirectoryName(path);
            if (directory is null)
            {
                return;
            }

            Directory.CreateDirectory(directory);

            var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            await System.IO.File.WriteAllBytesAsync(temporary, bytes, cancellationToken).ConfigureAwait(false);
            System.IO.File.Move(temporary, path, overwrite: true);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Un cache en échec — disque plein, droits manquants — ne doit pas priver
            // l'utilisateur de son affiche : elle a déjà été téléchargée.
            _logger.LogDebug(ex, "Impossible de mettre en cache l'affiche {Path}.", path);
        }
    }

    private static string? ResolveCachePath(string fileName)
    {
        var folder = Plugin.Instance?.DataFolderPath;
        return string.IsNullOrEmpty(folder) ? null : Path.Combine(folder, "posters", fileName);
    }

    private static string ContentTypeFor(string fileName)
    {
        if (fileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
        {
            return "image/png";
        }

        return fileName.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
            ? "image/webp"
            : "image/jpeg";
    }
}
