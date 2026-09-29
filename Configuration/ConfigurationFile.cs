using System;
using System.IO;
using System.Text;
using System.Xml;
using System.Xml.Serialization;

namespace JellyfinCarouselPlugin.Configuration;

/// <summary>
/// Lit et écrit le fichier des réglages sans pouvoir le perdre.
/// </summary>
/// <remarks>
/// <para>
/// Jellyfin lit les réglages des plugins avec un sérialiseur partagé, rangé par NOM de type.
/// Quand deux versions du plugin tournent ensemble (voir <c>Plugin</c>), la seconde reçoit le
/// sérialiseur de la première et lève <see cref="InvalidCastException"/>. <c>BasePlugin</c>
/// réécrit alors le fichier avec les valeurs par défaut ; cette écriture échoue à son tour,
/// mais elle a déjà vidé le fichier. Constaté en prod le 2026-09-29 : le serveur n'a pas
/// démarré, puis tous les réglages étaient perdus.
/// </para>
/// <para>
/// Ici, chaque type a son propre sérialiseur, un fichier illisible n'est jamais remplacé par
/// les valeurs par défaut, et une écriture passe par un fichier voisin renommé d'un coup : si
/// elle échoue, l'ancien fichier reste intact.
/// </para>
/// </remarks>
public static class ConfigurationFile
{
    private static readonly XmlWriterSettings WriterSettings = new()
    {
        Indent = true,
        Encoding = new UTF8Encoding(false)
    };

    /// <summary>
    /// Lit les réglages.
    /// </summary>
    /// <typeparam name="T">Type des réglages.</typeparam>
    /// <param name="path">Chemin du fichier.</param>
    /// <param name="problem">Pourquoi le fichier n'a pas pu être lu, ou <c>null</c>.</param>
    /// <returns>Les réglages du fichier ; ceux par défaut s'il manque ou s'il est illisible.</returns>
    public static T Read<T>(string path, out string? problem)
        where T : class, new()
    {
        problem = null;

        if (!File.Exists(path))
        {
            return new T();
        }

        try
        {
            using var stream = File.OpenRead(path);
            using var reader = XmlReader.Create(stream);

            if (Serializer<T>.Instance.Deserialize(reader) is T value)
            {
                return value;
            }

            problem = "fichier vide";
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException or XmlException)
        {
            // Le sérialiseur enveloppe l'erreur de lecture : sa cause parle davantage.
            problem = ex.InnerException?.Message ?? ex.Message;
        }

        return new T();
    }

    /// <summary>
    /// Écrit les réglages.
    /// </summary>
    /// <typeparam name="T">Type des réglages.</typeparam>
    /// <param name="path">Chemin du fichier.</param>
    /// <param name="value">Les réglages.</param>
    public static void Write<T>(string path, T value)
        where T : class, new()
    {
        ArgumentNullException.ThrowIfNull(value);

        Replace(path, stream =>
        {
            using var writer = XmlWriter.Create(stream, WriterSettings);
            Serializer<T>.Instance.Serialize(writer, value);
        });
    }

    /// <summary>
    /// Remplace un fichier d'un seul coup : le nouveau contenu est d'abord écrit à côté.
    /// </summary>
    /// <param name="path">Chemin du fichier.</param>
    /// <param name="write">Écrit le nouveau contenu.</param>
    public static void Replace(string path, Action<Stream> write)
    {
        ArgumentNullException.ThrowIfNull(write);

        var fullPath = Path.GetFullPath(path);
        var directory = Path.GetDirectoryName(fullPath) ?? throw new ArgumentException("Chemin sans dossier.", nameof(path));
        Directory.CreateDirectory(directory);

        // Dans le même dossier : le renommage reste sur le même disque, donc d'un seul tenant.
        var temporary = fullPath + "." + Guid.NewGuid().ToString("N") + ".tmp";

        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                write(stream);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporary, fullPath, overwrite: true);
        }
        finally
        {
            // Après un renommage réussi, il n'y a plus rien à cet endroit.
            TryDelete(temporary);
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Un reste de fichier temporaire ne gêne rien : le prochain nom sera différent.
        }
    }

    private static class Serializer<T>
    {
        // Propre à ce type-là : celui de Jellyfin, rangé par nom, peut appartenir à une autre
        // version du plugin chargée à côté.
        internal static readonly XmlSerializer Instance = new(typeof(T));
    }
}
