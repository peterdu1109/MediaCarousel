using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using JellyfinCarouselPlugin.Api;
using JellyfinCarouselPlugin.Configuration;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Valide les préférences reçues d'un compte, puis les applique sur les réglages du serveur.
/// </summary>
/// <remarks>
/// <para>
/// Ces deux opérations sont volontairement sans dépendance à Jellyfin : c'est ce qui permet
/// de les couvrir de tests, alors qu'elles décident de ce que chaque utilisateur voit.
/// </para>
/// <para>
/// <b>Rien de ce qui vient du client n'est cru sur parole.</b> La couleur d'accentuation part
/// dans une feuille de styles construite par concaténation, l'ordre des rangées pilote des
/// sélecteurs, et l'échelle du chiffre est une longueur CSS : une valeur arbitraire y ferait
/// exactement les dégâts qu'on imagine. Le contrôleur enregistre donc le résultat de
/// <see cref="Sanitize"/>, jamais l'objet reçu.
/// </para>
/// </remarks>
public static class UserPreferenceRules
{
    /// <summary>
    /// Identifiants de rangées acceptés dans un ordre personnalisé.
    /// </summary>
    /// <remarks>
    /// Doit rester synchronisé avec <c>PLUGIN_ROW_ORDER</c> et <c>NATIVE_DEFAULT_LAYOUT</c>
    /// de <c>media-carousel.js</c>. Un identifiant inconnu est écarté plutôt que refusé : une
    /// version antérieure ou postérieure du script ne doit pas rendre l'ordre invalide.
    /// </remarks>
    private static readonly HashSet<string> KnownRows = new(StringComparer.OrdinalIgnoreCase)
    {
        "local", "alltime", "global", "returning", "neverplayed", "because", "studios", "genres",
        "native:smalllibrarytiles", "native:librarybuttons", "native:activerecordings",
        "native:resume", "native:resumeaudio", "native:resumebook", "native:livetv",
        "native:nextup", "native:latestmedia"
    };

    /// <summary>
    /// Hauteur minimale du chiffre, en pourcentage de l'affiche.
    /// </summary>
    /// <remarks>
    /// Avec <see cref="MaxRankScale"/>, ce sont les bornes du rendu — <c>normalizeRankScale</c>
    /// de <c>media-carousel.js</c> — et de la page de configuration. Une valeur hors de ces
    /// bornes serait enregistrée sans rien changer à l'écran.
    /// </remarks>
    public const int MinRankScale = 40;

    /// <summary>
    /// Hauteur maximale du chiffre, en pourcentage de l'affiche.
    /// </summary>
    public const int MaxRankScale = 100;

    private static readonly Regex ColorPattern = new(
        "^#[0-9a-fA-F]{3,8}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>
    /// Nettoie des préférences reçues du client.
    /// </summary>
    /// <param name="preferences">Les préférences reçues, éventuellement <see langword="null"/>.</param>
    /// <returns>
    /// Des préférences dont chaque valeur est acceptable, ou <see langword="null"/> s'il n'en
    /// reste aucune — auquel cas le compte suit de nouveau les réglages du serveur.
    /// </returns>
    public static UserRowPreferences? Sanitize(UserRowPreferences? preferences)
    {
        if (preferences is null)
        {
            return null;
        }

        var clean = new UserRowPreferences
        {
            EnableHomeRows = preferences.EnableHomeRows,
            ShowLocalRow = preferences.ShowLocalRow,
            ShowAllTimeRow = preferences.ShowAllTimeRow,
            ShowGlobalRow = preferences.ShowGlobalRow,
            ShowReturningRow = preferences.ShowReturningRow,
            ShowNeverPlayedRow = preferences.ShowNeverPlayedRow,
            ShowBecauseRow = preferences.ShowBecauseRow,
            ShowStudioRow = preferences.ShowStudioRow,
            ShowGenreRows = preferences.ShowGenreRows,
            HideNativeSections = preferences.HideNativeSections,
            RowOrder = SanitizeOrder(preferences.RowOrder),
            HighlightColor = SanitizeColor(preferences.HighlightColor),
            RankNumberScale = SanitizeScale(preferences.RankNumberScale)
        };

        return clean.IsEmpty() ? null : clean;
    }

    /// <summary>
    /// Applique les choix d'un compte sur les réglages du serveur.
    /// </summary>
    /// <remarks>
    /// Une valeur laissée à <see langword="null"/> n'écrase rien : le compte suit alors
    /// l'administrateur, y compris pour une rangée apparue après son dernier choix. Un compte
    /// peut masquer une rangée, jamais rallumer celle que l'administrateur a coupée : elle
    /// n'est plus recalculée, et il aurait reçu son dernier classement, figé.
    /// </remarks>
    /// <param name="options">Les réglages du serveur, modifiés sur place.</param>
    /// <param name="preferences">Les choix du compte, éventuellement <see langword="null"/>.</param>
    /// <returns>Les réglages, pour l'enchaînement.</returns>
    public static ClientOptionsDto Apply(ClientOptionsDto options, UserRowPreferences? preferences)
    {
        ArgumentNullException.ThrowIfNull(options);

        options.ServerRows = ServerRows(options);

        if (preferences is null)
        {
            return options;
        }

        options.EnableHomeRows = options.EnableHomeRows && (preferences.EnableHomeRows ?? true);
        options.ShowLocalRow = options.ShowLocalRow && (preferences.ShowLocalRow ?? true);
        options.ShowAllTimeRow = options.ShowAllTimeRow && (preferences.ShowAllTimeRow ?? true);
        options.ShowGlobalRow = options.ShowGlobalRow && (preferences.ShowGlobalRow ?? true);
        options.ShowReturningRow = options.ShowReturningRow && (preferences.ShowReturningRow ?? true);
        options.ShowNeverPlayedRow = options.ShowNeverPlayedRow && (preferences.ShowNeverPlayedRow ?? true);
        options.ShowBecauseRow = options.ShowBecauseRow && (preferences.ShowBecauseRow ?? true);
        options.ShowStudioRow = options.ShowStudioRow && (preferences.ShowStudioRow ?? true);
        options.ShowGenreRows = options.ShowGenreRows && (preferences.ShowGenreRows ?? true);
        options.HideNativeSections = preferences.HideNativeSections ?? options.HideNativeSections;
        options.RowOrder = preferences.RowOrder ?? options.RowOrder;
        options.HighlightColor = preferences.HighlightColor ?? options.HighlightColor;
        // Validée ici aussi, et pas seulement à l'enregistrement : le fichier peut porter
        // une valeur enregistrée par une version antérieure, sous d'autres bornes.
        options.RankNumberScale = SanitizeScale(preferences.RankNumberScale) ?? options.RankNumberScale;

        return options;
    }

    /// <summary>
    /// Relève les rangées que l'administrateur affiche, avant tout choix du compte.
    /// </summary>
    /// <param name="options">Les réglages du serveur.</param>
    /// <returns>Les noms des cases cochées.</returns>
    public static IReadOnlyList<string> ServerRows(ClientOptionsDto options)
    {
        ArgumentNullException.ThrowIfNull(options);

        var rows = new List<string>();
        void Add(bool shown, string name)
        {
            if (shown)
            {
                rows.Add(name);
            }
        }

        Add(options.ShowLocalRow, nameof(ClientOptionsDto.ShowLocalRow));
        Add(options.ShowAllTimeRow, nameof(ClientOptionsDto.ShowAllTimeRow));
        Add(options.ShowGlobalRow, nameof(ClientOptionsDto.ShowGlobalRow));
        Add(options.ShowReturningRow, nameof(ClientOptionsDto.ShowReturningRow));
        Add(options.ShowNeverPlayedRow, nameof(ClientOptionsDto.ShowNeverPlayedRow));
        Add(options.ShowBecauseRow, nameof(ClientOptionsDto.ShowBecauseRow));
        Add(options.ShowStudioRow, nameof(ClientOptionsDto.ShowStudioRow));
        Add(options.ShowGenreRows, nameof(ClientOptionsDto.ShowGenreRows));
        return rows;
    }

    /// <summary>
    /// Retient les identifiants connus, sans doublon, dans l'ordre demandé.
    /// </summary>
    private static string? SanitizeOrder(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var kept = new List<string>();

        foreach (var raw in value.Split(','))
        {
            var id = raw.Trim().ToLowerInvariant();

            if (KnownRows.Contains(id) && !kept.Contains(id, StringComparer.Ordinal))
            {
                kept.Add(id);
            }
        }

        return kept.Count == 0 ? null : string.Join(',', kept);
    }

    private static string? SanitizeColor(string? value)
    {
        var trimmed = value?.Trim();
        return !string.IsNullOrEmpty(trimmed) && ColorPattern.IsMatch(trimmed) ? trimmed : null;
    }

    /// <summary>
    /// Borne l'échelle du chiffre à ce que le rendu sait afficher.
    /// </summary>
    /// <remarks>
    /// Une valeur sous le plancher n'est pas relevée au plancher : elle est ÉCARTÉE. C'est la
    /// signature du défaut du panneau jusqu'en 3.14.1, dont le curseur, mal initialisé,
    /// enregistrait 25 dès qu'on validait — sans que personne l'ait choisi. La relever à 40
    /// figerait ce chiffre réduit ; l'écarter rend le compte au réglage du serveur.
    /// </remarks>
    private static int? SanitizeScale(int? value)
        => value is null || value.Value < MinRankScale ? null : Math.Min(value.Value, MaxRankScale);
}
