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
}
