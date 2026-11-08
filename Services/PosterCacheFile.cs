using System;
using System.IO;

namespace JellyfinCarouselPlugin.Services;

/// <summary>Opérations sur les fichiers du cache d'affiches.</summary>
public static class PosterCacheFile
{
    /// <summary>
    /// Pose la date d'accès d'un fichier du cache. Un horodatage qui ne se pose pas
    /// (droits refusés, fichier verrouillé) ne doit jamais priver l'appelant de l'image.
    /// </summary>
    /// <returns>Vrai si la date a été posée.</returns>
    public static bool TryTouch(string path, Action<string, DateTime>? setter = null)
    {
        try
        {
            (setter ?? File.SetLastAccessTimeUtc)(path, DateTime.UtcNow);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }
}
