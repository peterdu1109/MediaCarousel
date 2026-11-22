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

    /// <summary>
    /// Supprime les fichiers du dossier dont la date d'accès précède la limite. Un fichier qui ne
    /// se supprime pas (verrouillé, droits refusés) est laissé : il n'arrête pas la purge des autres.
    /// </summary>
    /// <param name="folder">Le dossier du cache.</param>
    /// <param name="cutoff">Date d'accès (UTC) en deçà de laquelle un fichier est purgé.</param>
    /// <param name="deleter">Suppression d'un fichier, remplaçable pour les tests.</param>
    /// <returns>Le nombre de fichiers supprimés.</returns>
    public static int PurgeOlderThan(string folder, DateTime cutoff, Action<string>? deleter = null)
    {
        var delete = deleter ?? File.Delete;
        var removed = 0;

        foreach (var file in Directory.EnumerateFiles(folder))
        {
            try
            {
                if (File.GetLastAccessTimeUtc(file) < cutoff)
                {
                    delete(file);
                    removed++;
                }
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // Laissé en place : repris à la prochaine purge.
            }
        }

        return removed;
    }
}
