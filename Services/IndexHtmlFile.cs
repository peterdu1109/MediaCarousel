using System;
using System.IO;
using System.Linq;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Lecture et réécriture de <c>index.html</c> sur le disque, quand File Transformation est absent.
/// </summary>
/// <remarks>
/// Sans dépendance Jellyfin : la tâche d'intégration et la désinstallation passent toutes deux
/// par ici, et les tests l'exercent sur un vrai fichier.
/// </remarks>
public static class IndexHtmlFile
{
    /// <summary>
    /// Cherche <c>index.html</c> aux emplacements connus de l'interface web.
    /// </summary>
    /// <param name="webPath">Répertoire de l'interface web déclaré par Jellyfin.</param>
    /// <param name="programDataPath">Répertoire des données du programme.</param>
    /// <returns>Le chemin du premier fichier trouvé, ou <c>null</c>.</returns>
    public static string? Find(string webPath, string programDataPath)
    {
        var candidates = new[]
        {
            Path.Combine(webPath, "index.html"),
            Path.Combine(programDataPath, "jellyfin-web", "index.html"),
            Path.Combine(AppContext.BaseDirectory, "jellyfin-web", "index.html"),
            Path.Combine(AppContext.BaseDirectory, "web", "index.html")
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    /// <summary>
    /// Applique une transformation au fichier, s'il en sort changé.
    /// </summary>
    /// <param name="path">Chemin de <c>index.html</c>.</param>
    /// <param name="transform">Transformation du contenu.</param>
    /// <returns><c>true</c> si le fichier a été réécrit.</returns>
    /// <exception cref="UnauthorizedAccessException">Écriture refusée ; le fichier est inchangé.</exception>
    /// <exception cref="IOException">Écriture impossible ; le fichier est inchangé.</exception>
    public static bool Update(string path, Func<string, string> transform)
    {
        ArgumentNullException.ThrowIfNull(transform);

        var original = File.ReadAllText(path);
        var updated = transform(original);

        if (string.Equals(original, updated, StringComparison.Ordinal))
        {
            return false;
        }

        // index.html est le point d'entrée de toute l'interface web : une coupure pendant
        // l'écriture le laisserait tronqué et Jellyfin ne chargerait plus du tout. Le fichier
        // temporaire est créé dans le même répertoire pour que le remplacement soit atomique.
        var temporary = path + ".mediacarousel.tmp";
        File.WriteAllText(temporary, updated);
        File.Move(temporary, path, overwrite: true);
        return true;
    }

    /// <summary>
    /// Défait l'intégration au moment de la désinstallation.
    /// </summary>
    /// <remarks>
    /// Sans cela, la balise écrite sur le disque survit au plugin : chaque chargement de
    /// l'interface demande un script qui n'existe plus. Avec File Transformation, le rappel
    /// reste enregistré jusqu'au redémarrage ; il est réduit à retirer la balise.
    /// </remarks>
    /// <param name="webPath">Répertoire de l'interface web déclaré par Jellyfin.</param>
    /// <param name="programDataPath">Répertoire des données du programme.</param>
    /// <returns>Le chemin réécrit, ou <c>null</c> si aucun fichier n'a changé.</returns>
    public static string? Uninstall(string webPath, string programDataPath)
    {
        IndexHtmlTransformer.RowsEnabled = static () => false;

        var path = Find(webPath, programDataPath);
        return path is not null && Update(path, ScriptTag.Remove) ? path : null;
    }
}
