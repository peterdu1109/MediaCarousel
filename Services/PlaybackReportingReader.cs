using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using MediaBrowser.Common.Configuration;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Une ligne de l'historique de Playback Reporting.
/// </summary>
/// <param name="UserId">Compte, tel que Playback Reporting l'écrit.</param>
/// <param name="ItemId">Élément lu, tel que Playback Reporting l'écrit.</param>
/// <param name="ItemType"><c>Movie</c> ou <c>Episode</c>.</param>
/// <param name="Seconds">Durée réellement regardée.</param>
/// <param name="PlayedAt">Moment de la lecture, à l'heure du serveur.</param>
public readonly record struct PlaybackRow(string UserId, string ItemId, string ItemType, int Seconds, DateTime PlayedAt);

/// <summary>
/// Lit l'historique des lectures tenu par le plugin Playback Reporting, s'il est installé.
/// </summary>
/// <remarks>
/// Sa base SQLite, <c>playback_reporting.db</c> dans le dossier de données de Jellyfin, garde
/// chaque lecture avec sa durée réelle. Elle est ouverte en lecture seule, sans pool : le plugin
/// qui l'écrit n'est jamais gêné. Seuls les films et les épisodes sont lus — la musique, qu'elle
/// vienne de la bibliothèque musicale ou d'une fiche, les vidéos et la télévision en direct n'ont
/// rien à faire dans un Top de films et de séries.
/// </remarks>
public sealed class PlaybackReportingReader
{
    private readonly IApplicationPaths _paths;
    private readonly ILogger<PlaybackReportingReader> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="PlaybackReportingReader"/>.
    /// </summary>
    /// <param name="paths">Chemins de Jellyfin.</param>
    /// <param name="logger">Journal.</param>
    public PlaybackReportingReader(IApplicationPaths paths, ILogger<PlaybackReportingReader> logger)
    {
        _paths = paths;
        _logger = logger;
    }

    /// <summary>
    /// Obtient le chemin de la base de Playback Reporting.
    /// </summary>
    public string DatabasePath => Path.Combine(_paths.DataPath, "playback_reporting.db");

    /// <summary>
    /// Lit les lectures de films et d'épisodes depuis une date.
    /// </summary>
    /// <param name="sinceLocal">Début de la fenêtre, à l'heure du serveur — celle qu'écrit Playback Reporting.</param>
    /// <returns>Les lectures, ou <c>null</c> si Playback Reporting n'est pas installé ou que sa base est illisible.</returns>
    public IReadOnlyList<PlaybackRow>? ReadSince(DateTime sinceLocal)
    {
        var path = DatabasePath;
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = path,
                Mode = SqliteOpenMode.ReadOnly,
                Pooling = false,
                DefaultTimeout = 5
            }.ToString();

            using var connection = new SqliteConnection(connectionString);
            connection.Open();

            using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT UserId, ItemId, ItemType, PlayDuration, DateCreated FROM PlaybackActivity "
                + "WHERE DateCreated >= $since AND ItemType IN ('Movie', 'Episode')";
            command.Parameters.AddWithValue("$since", sinceLocal.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture));

            var rows = new List<PlaybackRow>();
            using var reader = command.ExecuteReader();

            while (reader.Read())
            {
                if (!DateTime.TryParse(
                        Convert.ToString(reader.GetValue(4), CultureInfo.InvariantCulture),
                        CultureInfo.InvariantCulture,
                        DateTimeStyles.None,
                        out var playedAt))
                {
                    continue;
                }

                rows.Add(new PlaybackRow(
                    Convert.ToString(reader.GetValue(0), CultureInfo.InvariantCulture) ?? string.Empty,
                    Convert.ToString(reader.GetValue(1), CultureInfo.InvariantCulture) ?? string.Empty,
                    Convert.ToString(reader.GetValue(2), CultureInfo.InvariantCulture) ?? string.Empty,
                    int.TryParse(Convert.ToString(reader.GetValue(3), CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out var seconds) ? seconds : 0,
                    playedAt));
            }

            return rows;
        }
        catch (Exception ex)
        {
            // Une base verrouillée ou d'un autre format ne doit pas priver le serveur de Top :
            // le calcul sur les titres vus reprend la main.
            _logger.LogWarning(ex, "Historique de Playback Reporting illisible : le Top du serveur est calculé sur les titres vus.");
            return null;
        }
    }
}
