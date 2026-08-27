using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using JellyfinCarouselPlugin.Models;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Persiste les instantanés dans le dossier de données du plugin.
/// </summary>
/// <remarks>
/// Sans cela, un redémarrage du serveur vide toutes les rangées jusqu'à la fin du premier
/// recalcul — et ce recalcul peut prendre du temps sur une grande bibliothèque, ou attendre
/// le réseau pour le Top mondial. Les rangées réapparaissent donc immédiatement, avec les
/// dernières valeurs connues, puis se rafraîchissent quand le calcul aboutit.
/// </remarks>
public sealed class SnapshotStorage
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly ILogger<SnapshotStorage> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="SnapshotStorage"/>.
    /// </summary>
    /// <param name="logger">Journal.</param>
    public SnapshotStorage(ILogger<SnapshotStorage> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Relit une liste de titres depuis le disque.
    /// </summary>
    /// <param name="kind">Nature de la liste.</param>
    /// <returns>L'instantané relu, ou <c>null</c> s'il n'existe pas ou est illisible.</returns>
    public TopListSnapshot? LoadTopList(TopListKind kind)
    {
        var stored = Read<StoredTopList>("toplist-" + kind);

        return stored?.Entries is null
            ? null
            : TopListSnapshot.Restore(kind, stored.Source ?? "None", stored.Entries, stored.GeneratedUtc);
    }

    /// <summary>
    /// Écrit une liste de titres sur le disque.
    /// </summary>
    /// <param name="snapshot">L'instantané à écrire.</param>
    public void SaveTopList(TopListSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        Write("toplist-" + snapshot.Kind, new StoredTopList
        {
            Source = snapshot.Source,
            GeneratedUtc = snapshot.GeneratedUtc,
            Entries = snapshot.Entries
        });
    }

    /// <summary>
    /// Relit un catalogue depuis le disque.
    /// </summary>
    /// <param name="kind">Nature du catalogue.</param>
    /// <returns>Le catalogue relu, ou <c>null</c> s'il n'existe pas ou est illisible.</returns>
    public CatalogSnapshot? LoadCatalog(CatalogKind kind)
    {
        var stored = Read<StoredCatalog>("catalog-" + kind);

        return stored?.Entries is null
            ? null
            : CatalogSnapshot.Restore(kind, stored.Entries, stored.GeneratedUtc);
    }

    /// <summary>
    /// Écrit un catalogue sur le disque.
    /// </summary>
    /// <param name="snapshot">Le catalogue à écrire.</param>
    public void SaveCatalog(CatalogSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        Write("catalog-" + snapshot.Kind, new StoredCatalog
        {
            GeneratedUtc = snapshot.GeneratedUtc,
            Entries = snapshot.Entries
        });
    }

    private string? GetPath(string name)
    {
        var folder = Plugin.Instance?.DataFolderPath;
        return string.IsNullOrEmpty(folder) ? null : Path.Combine(folder, name + ".json");
    }

    private T? Read<T>(string name)
        where T : class
    {
        var path = GetPath(name);

        if (path is null || !File.Exists(path))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(File.ReadAllText(path), SerializerOptions);
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            // Un fichier corrompu ne doit pas empêcher le plugin de démarrer :
            // le prochain recalcul le remplacera.
            _logger.LogWarning(ex, "Instantané {Name} illisible, il sera reconstruit.", name);
            return null;
        }
    }

    private void Write<T>(string name, T value)
    {
        var path = GetPath(name);

        if (path is null)
        {
            return;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);

            // Écriture puis remplacement : un arrêt brutal ne laisse jamais un fichier tronqué.
            var temporary = path + ".tmp";
            File.WriteAllText(temporary, JsonSerializer.Serialize(value, SerializerOptions));
            File.Move(temporary, path, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "Impossible d'écrire l'instantané {Name}.", name);
        }
    }

    private sealed class StoredTopList
    {
        public string? Source { get; set; }

        public DateTime GeneratedUtc { get; set; }

        public IReadOnlyList<TopListEntry>? Entries { get; set; }
    }

    private sealed class StoredCatalog
    {
        public DateTime GeneratedUtc { get; set; }

        public IReadOnlyList<CatalogEntry>? Entries { get; set; }
    }
}
