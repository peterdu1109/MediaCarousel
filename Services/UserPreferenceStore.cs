using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using JellyfinCarouselPlugin.Configuration;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Conserve les choix d'affichage propres à chaque compte.
/// </summary>
/// <remarks>
/// <para>
/// <b>Pourquoi un fichier séparé et non la configuration du plugin :</b> écrire dans
/// <c>MediaCarousel.xml</c> demande <c>UpdateConfiguration</c>, qui réécrit toute la
/// configuration et notifie le serveur. Un utilisateur qui coche une case déclencherait
/// alors la même mécanique qu'une modification administrateur, sur un fichier que plusieurs
/// comptes toucheraient en même temps. Les préférences vivent donc à côté des instantanés,
/// dans le dossier de données du plugin.
/// </para>
/// <para>
/// Tout est gardé en mémoire et le fichier n'est relu qu'une fois : ces valeurs sont lues à
/// chaque chargement de la page d'accueil de chaque utilisateur, elles ne peuvent pas passer
/// par le disque à chaque requête.
/// </para>
/// </remarks>
public sealed class UserPreferenceStore
{
    private const string FileName = "user-preferences.json";

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };

    private readonly object _lock = new();
    private readonly ILogger<UserPreferenceStore> _logger;
    private Dictionary<string, UserRowPreferences>? _entries;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="UserPreferenceStore"/>.
    /// </summary>
    /// <param name="logger">Journal.</param>
    public UserPreferenceStore(ILogger<UserPreferenceStore> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Renvoie les préférences d'un compte.
    /// </summary>
    /// <param name="userId">Identifiant du compte.</param>
    /// <returns>Les préférences enregistrées, ou <see langword="null"/> si le compte n'a rien choisi.</returns>
    public UserRowPreferences? Get(Guid userId)
    {
        if (userId == Guid.Empty)
        {
            return null;
        }

        lock (_lock)
        {
            return Load().TryGetValue(Key(userId), out var preferences) ? preferences : null;
        }
    }

    /// <summary>
    /// Enregistre les préférences d'un compte.
    /// </summary>
    /// <remarks>
    /// Des préférences vides valent une remise aux valeurs du serveur : l'entrée est retirée
    /// plutôt que conservée à vide, sans quoi le fichier grossirait d'un enregistrement par
    /// compte ayant ouvert le panneau une fois.
    /// </remarks>
    /// <param name="userId">Identifiant du compte.</param>
    /// <param name="preferences">Les choix à conserver, ou <see langword="null"/> pour tout effacer.</param>
    public void Save(Guid userId, UserRowPreferences? preferences)
    {
        if (userId == Guid.Empty)
        {
            return;
        }

        lock (_lock)
        {
            var entries = Load();
            var key = Key(userId);

            if (preferences is null || preferences.IsEmpty())
            {
                if (!entries.Remove(key))
                {
                    return;
                }
            }
            else
            {
                entries[key] = preferences;
            }

            Write(entries);
        }
    }

    private static string Key(Guid userId) => userId.ToString("N", CultureInfo.InvariantCulture);

    private static string? GetPath()
    {
        var folder = Plugin.Instance?.DataFolderPath;
        return string.IsNullOrEmpty(folder) ? null : Path.Combine(folder, FileName);
    }

    /// <summary>
    /// Relit le fichier à la première demande. Appelé sous verrou.
    /// </summary>
    private Dictionary<string, UserRowPreferences> Load()
    {
        if (_entries is not null)
        {
            return _entries;
        }

        var path = GetPath();

        if (path is not null && File.Exists(path))
        {
            try
            {
                _entries = JsonSerializer.Deserialize<Dictionary<string, UserRowPreferences>>(
                    File.ReadAllText(path),
                    SerializerOptions);
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                // Un fichier illisible ne doit pas priver tout le serveur de ses rangées :
                // chacun retombe sur les valeurs de l'administrateur.
                _logger.LogWarning(ex, "Préférences utilisateur illisibles, elles sont ignorées.");
            }
        }

        _entries ??= new Dictionary<string, UserRowPreferences>(StringComparer.OrdinalIgnoreCase);
        return _entries;
    }

    /// <summary>
    /// Écrit le fichier. Appelé sous verrou.
    /// </summary>
    private void Write(Dictionary<string, UserRowPreferences> entries)
    {
        var path = GetPath();

        if (path is null)
        {
            return;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);

            // Écriture puis remplacement : un arrêt brutal ne laisse jamais un fichier tronqué.
            var temporary = path + ".tmp";
            File.WriteAllText(temporary, JsonSerializer.Serialize(entries, SerializerOptions));
            File.Move(temporary, path, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // La valeur reste en mémoire : le choix de l'utilisateur tient jusqu'au
            // redémarrage, même si le disque refuse l'écriture.
            _logger.LogError(ex, "Impossible d'enregistrer les préférences utilisateur.");
        }
    }
}
