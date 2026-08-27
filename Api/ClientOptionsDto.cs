namespace JellyfinCarouselPlugin.Api;

/// <summary>
/// Réglages d'affichage transmis au script de la page d'accueil.
/// </summary>
/// <remarks>
/// Ce contrat est volontairement minimal : il ne contient que ce dont le rendu a besoin.
/// La configuration complète du plugin — clé d'API externe comprise — reste réservée aux
/// administrateurs via l'API de configuration de Jellyfin.
/// </remarks>
public sealed class ClientOptionsDto
{
    /// <summary>Obtient ou définit une valeur indiquant si les rangées doivent être affichées.</summary>
    public bool EnableHomeRows { get; set; }

    /// <summary>Obtient ou définit une valeur indiquant si la rangée du Top local est active.</summary>
    public bool ShowLocalRow { get; set; }

    /// <summary>Obtient ou définit une valeur indiquant si la rangée du Top mondial est active.</summary>
    public bool ShowGlobalRow { get; set; }

    /// <summary>Obtient ou définit le titre de la rangée du Top local.</summary>
    public string LocalRowTitle { get; set; } = string.Empty;

    /// <summary>Obtient ou définit le titre de la rangée du Top mondial.</summary>
    public string GlobalRowTitle { get; set; } = string.Empty;

    /// <summary>Obtient ou définit la couleur d'accentuation.</summary>
    public string HighlightColor { get; set; } = string.Empty;

    /// <summary>Obtient ou définit le nombre d'entrées de la rangée du Top local.</summary>
    public int LocalRowSize { get; set; }

    /// <summary>Obtient ou définit le nombre d'entrées de la rangée du Top mondial.</summary>
    public int GlobalRowSize { get; set; }

    /// <summary>Obtient ou définit une valeur indiquant si la rangée des studios est active.</summary>
    public bool ShowStudioRow { get; set; }

    /// <summary>Obtient ou définit le titre de la rangée des studios.</summary>
    public string StudioRowTitle { get; set; } = string.Empty;

    /// <summary>Obtient ou définit le nombre de studios affichés.</summary>
    public int StudioRowSize { get; set; }

    /// <summary>Obtient ou définit une valeur indiquant si les rangées par genre sont actives.</summary>
    public bool ShowGenreRows { get; set; }

    /// <summary>Obtient ou définit le nombre de rangées de genre.</summary>
    public int GenreRowCount { get; set; }

    /// <summary>Obtient ou définit le nombre de titres par rangée de genre.</summary>
    public int GenreRowItemCount { get; set; }
}
