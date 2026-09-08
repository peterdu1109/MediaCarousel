namespace JellyfinCarouselPlugin.Configuration;

/// <summary>
/// Choix d'affichage propres à un compte, qui l'emportent sur les valeurs du serveur.
/// </summary>
/// <remarks>
/// <para>
/// <b>Chaque propriété est nullable, et c'est tout le contrat :</b> <see langword="null"/>
/// signifie « je n'ai rien choisi, prends la valeur de l'administrateur ». Sans cette
/// distinction, une préférence enregistrée figerait la valeur du jour et l'utilisateur ne
/// suivrait plus jamais les réglages du serveur — un administrateur qui active une nouvelle
/// rangée ne la verrait apparaître chez personne.
/// </para>
/// <para>
/// Seuls des choix d'<b>affichage</b> figurent ici. Les tailles de rangées, les titres, les
/// fenêtres d'observation et la source externe restent du ressort de l'administrateur : ils
/// décident de ce qui est <i>calculé</i>, une seule fois pour tout le serveur, alors que ces
/// préférences ne décident que de ce qui est <i>montré</i> à un compte. Un utilisateur qui
/// pourrait changer une taille demanderait un recalcul rien que pour lui.
/// </para>
/// </remarks>
public sealed class UserRowPreferences
{
    /// <summary>Obtient ou définit l'affichage des rangées du plugin, ou <see langword="null"/>.</summary>
    public bool? EnableHomeRows { get; set; }

    /// <summary>Obtient ou définit l'affichage du Top du serveur, ou <see langword="null"/>.</summary>
    public bool? ShowLocalRow { get; set; }

    /// <summary>Obtient ou définit l'affichage du Top de toujours, ou <see langword="null"/>.</summary>
    public bool? ShowAllTimeRow { get; set; }

    /// <summary>Obtient ou définit l'affichage du Top mondial, ou <see langword="null"/>.</summary>
    public bool? ShowGlobalRow { get; set; }

    /// <summary>Obtient ou définit l'affichage de « de retour cette semaine », ou <see langword="null"/>.</summary>
    public bool? ShowReturningRow { get; set; }

    /// <summary>Obtient ou définit l'affichage de « jamais vu », ou <see langword="null"/>.</summary>
    public bool? ShowNeverPlayedRow { get; set; }

    /// <summary>Obtient ou définit l'affichage de « parce que tu as regardé », ou <see langword="null"/>.</summary>
    public bool? ShowBecauseRow { get; set; }

    /// <summary>Obtient ou définit l'affichage de la rangée des studios, ou <see langword="null"/>.</summary>
    public bool? ShowStudioRow { get; set; }

    /// <summary>Obtient ou définit l'affichage des rangées de genre, ou <see langword="null"/>.</summary>
    public bool? ShowGenreRows { get; set; }

    /// <summary>Obtient ou définit le masquage des sections natives, ou <see langword="null"/>.</summary>
    public bool? HideNativeSections { get; set; }

    /// <summary>Obtient ou définit l'ordre des rangées, ou <see langword="null"/>.</summary>
    public string? RowOrder { get; set; }

    /// <summary>Obtient ou définit la couleur d'accentuation, ou <see langword="null"/>.</summary>
    public string? HighlightColor { get; set; }

    /// <summary>Obtient ou définit la hauteur du chiffre du rang, en pourcentage, ou <see langword="null"/>.</summary>
    public int? RankNumberScale { get; set; }

    /// <summary>
    /// Indique si ces préférences ne portent plus aucun choix.
    /// </summary>
    /// <remarks>
    /// Un enregistrement vide est supprimé plutôt que conservé : le fichier ne garde que les
    /// comptes qui ont réellement choisi quelque chose.
    /// </remarks>
    /// <returns><see langword="true"/> si tout est à <see langword="null"/>.</returns>
    public bool IsEmpty()
        => EnableHomeRows is null
            && ShowLocalRow is null
            && ShowAllTimeRow is null
            && ShowGlobalRow is null
            && ShowReturningRow is null
            && ShowNeverPlayedRow is null
            && ShowBecauseRow is null
            && ShowStudioRow is null
            && ShowGenreRows is null
            && HideNativeSections is null
            && RowOrder is null
            && HighlightColor is null
            && RankNumberScale is null;
}
