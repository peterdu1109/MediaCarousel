using System;

namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// État d'un classement ou d'un catalogue, tel qu'affiché dans la page de configuration.
/// </summary>
public sealed class SectionStatusDto
{
    /// <summary>Obtient ou définit une valeur indiquant si la section est activée.</summary>
    public bool Enabled { get; set; }

    /// <summary>Obtient ou définit le nombre d'entrées calculées.</summary>
    public int Count { get; set; }

    /// <summary>Obtient ou définit la source des données.</summary>
    public string Source { get; set; } = string.Empty;

    /// <summary>
    /// Obtient ou définit l'instant du dernier calcul (UTC), ou <c>null</c> si aucun
    /// calcul n'a encore eu lieu depuis le démarrage du serveur.
    /// </summary>
    public DateTime? GeneratedUtc { get; set; }
}

/// <summary>
/// L'échec d'une section pendant le dernier recalcul.
/// </summary>
public sealed class RefreshFailureDto
{
    /// <summary>Obtient ou définit le nom lisible de la section en échec.</summary>
    public string Section { get; set; } = string.Empty;

    /// <summary>Obtient ou définit le message de l'erreur rattrapée.</summary>
    public string Message { get; set; } = string.Empty;
}

/// <summary>
/// Bilan du dernier recalcul complet.
/// </summary>
/// <remarks>
/// Sans lui, la tolérance aux pannes rend les échecs invisibles : l'instantané précédent est
/// conservé, la rangée a l'air normale, et seule la date vieillit. La page de configuration
/// affiche ce bilan pour que l'administrateur voie l'échec sans ouvrir le journal.
/// </remarks>
public sealed class RefreshReportDto
{
    /// <summary>Obtient ou définit le début du dernier recalcul (UTC), ou <c>null</c> si aucun n'a eu lieu.</summary>
    public DateTime? StartedUtc { get; set; }

    /// <summary>Obtient ou définit la durée du dernier recalcul, en secondes.</summary>
    public double? DurationSeconds { get; set; }

    /// <summary>Obtient ou définit une valeur indiquant si un recalcul est en cours.</summary>
    public bool Running { get; set; }

    /// <summary>Obtient ou définit les sections en échec au dernier recalcul ; vide quand tout a réussi.</summary>
    public RefreshFailureDto[] Failures { get; set; } = Array.Empty<RefreshFailureDto>();
}

/// <summary>
/// État général du plugin, destiné à la page de configuration.
/// </summary>
public sealed class PluginStatusDto
{
    /// <summary>Obtient ou définit la version du plugin.</summary>
    public string Version { get; set; } = string.Empty;

    /// <summary>Obtient ou définit l'état du Top du serveur.</summary>
    public SectionStatusDto LocalTop { get; set; } = new();

    /// <summary>Obtient ou définit l'état du Top mondial.</summary>
    public SectionStatusDto GlobalTop { get; set; } = new();

    /// <summary>Obtient ou définit l'état de la rangée « jamais vu ».</summary>
    public SectionStatusDto NeverPlayed { get; set; } = new();

    /// <summary>Obtient ou définit l'état de la rangée « de retour ».</summary>
    public SectionStatusDto ReturningSeries { get; set; } = new();

    /// <summary>Obtient ou définit l'état du catalogue des studios.</summary>
    public SectionStatusDto Studios { get; set; } = new();

    /// <summary>Obtient ou définit l'état du catalogue des genres.</summary>
    public SectionStatusDto Genres { get; set; } = new();

    /// <summary>Obtient ou définit le bilan du dernier recalcul.</summary>
    public RefreshReportDto LastRun { get; set; } = new();
}
