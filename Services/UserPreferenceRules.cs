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
    /// l'administrateur, y compris pour une rangée apparue après son dernier choix.
    /// </remarks>
    /// <param name="options">Les réglages du serveur, modifiés sur place.</param>
    /// <param name="preferences">Les choix du compte, éventuellement <see langword="null"/>.</param>
    /// <returns>Les réglages, pour l'enchaînement.</returns>
    public static ClientOptionsDto Apply(ClientOptionsDto options, UserRowPreferences? preferences)
    {
        ArgumentNullException.ThrowIfNull(options);

        if (preferences is null)
        {
            return options;
        }

        options.EnableHomeRows = preferences.EnableHomeRows ?? options.EnableHomeRows;
        options.ShowLocalRow = preferences.ShowLocalRow ?? options.ShowLocalRow;
        options.ShowAllTimeRow = preferences.ShowAllTimeRow ?? options.ShowAllTimeRow;
        options.ShowGlobalRow = preferences.ShowGlobalRow ?? options.ShowGlobalRow;
        options.ShowReturningRow = preferences.ShowReturningRow ?? options.ShowReturningRow;
        options.ShowNeverPlayedRow = preferences.ShowNeverPlayedRow ?? options.ShowNeverPlayedRow;
        options.ShowBecauseRow = preferences.ShowBecauseRow ?? options.ShowBecauseRow;
        options.ShowStudioRow = preferences.ShowStudioRow ?? options.ShowStudioRow;
        options.ShowGenreRows = preferences.ShowGenreRows ?? options.ShowGenreRows;
        options.HideNativeSections = preferences.HideNativeSections ?? options.HideNativeSections;
        options.RowOrder = preferences.RowOrder ?? options.RowOrder;
        options.HighlightColor = preferences.HighlightColor ?? options.HighlightColor;
        options.RankNumberScale = preferences.RankNumberScale ?? options.RankNumberScale;

        return options;
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
    /// Borne l'échelle du chiffre. En dehors de ces limites, il disparaît ou couvre l'affiche.
    /// </summary>
    private static int? SanitizeScale(int? value)
        => value.HasValue ? Math.Clamp(value.Value, 25, 200) : null;
}
