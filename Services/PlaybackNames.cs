using System.Globalization;
using System.Text.RegularExpressions;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Un épisode tel que Playback Reporting le nomme : série, saison, numéro.
/// </summary>
/// <param name="Series">Nom de la série.</param>
/// <param name="Season">Numéro de saison.</param>
/// <param name="Episode">Numéro d'épisode.</param>
public readonly record struct PlaybackEpisodeName(string Series, int Season, int Episode);

/// <summary>
/// Lit les noms que Playback Reporting enregistre avec chaque lecture.
/// </summary>
/// <remarks>
/// Un fichier remplacé après avoir été regardé — une meilleure qualité téléchargée, typiquement —
/// change d'identifiant : l'historique pointe alors vers un élément qui n'existe plus. Constaté en
/// prod le 2026-09-28 : deux personnes avaient regardé One Piece s23e25, remplacé depuis, et la
/// série sortait du Top. Le nom enregistré — « One Piece - s23e25 - Le désespoir… » — permet de
/// retrouver l'épisode d'aujourd'hui.
/// </remarks>
public static partial class PlaybackNames
{
    /// <summary>
    /// Lit un nom d'épisode au format de Playback Reporting : « Série - sXXeYY - Titre ».
    /// </summary>
    /// <param name="itemName">Le nom enregistré.</param>
    /// <returns>La série, la saison et le numéro, ou <c>null</c> si le nom n'a pas cette forme.</returns>
    public static PlaybackEpisodeName? ParseEpisode(string? itemName)
    {
        if (string.IsNullOrWhiteSpace(itemName))
        {
            return null;
        }

        var match = EpisodePattern().Match(itemName.Trim());
        if (!match.Success)
        {
            return null;
        }

        var series = match.Groups["series"].Value.Trim();
        return series.Length == 0
            ? null
            : new PlaybackEpisodeName(
                series,
                int.Parse(match.Groups["season"].Value, CultureInfo.InvariantCulture),
                int.Parse(match.Groups["episode"].Value, CultureInfo.InvariantCulture));
    }

    // La série s'arrête au PREMIER « - sXXeYY » : son nom peut contenir des tirets
    // (« Re:ZERO -Starting Life in Another World- »), pas un numéro d'épisode.
    [GeneratedRegex(@"^(?<series>.+?) - [sS](?<season>\d{1,4})[eE](?<episode>\d{1,5})(?: - .*)?$", RegexOptions.CultureInvariant)]
    private static partial Regex EpisodePattern();
}
