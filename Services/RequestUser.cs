using System;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Choisit le compte au nom duquel une requête est filtrée.
/// </summary>
/// <remarks>
/// Cette classe est délibérément sans dépendance Jellyfin : c'est ce qui permet de la
/// couvrir de tests, la règle qu'elle porte décidant de ce que chaque compte peut voir.
/// </remarks>
public static class RequestUser
{
    /// <summary>
    /// Donne l'identifiant du compte à retenir pour le filtrage.
    /// </summary>
    /// <remarks>
    /// Le jeton prime TOUJOURS sur le paramètre. L'inverse laissait un compte standard
    /// demander le classement « pour » un administrateur : le filtrage de visibilité
    /// s'appliquait alors au compte nommé et non à l'appelant, qui recevait les titres,
    /// années et affiches des bibliothèques dont il est pourtant exclu.
    ///
    /// Aucun utilisateur dans le jeton : c'est un appel par clé d'API, qui vaut déjà
    /// administrateur. Le paramètre sert alors à choisir le point de vue du filtrage.
    /// </remarks>
    /// <param name="claim">La valeur de la revendication d'utilisateur du jeton, s'il y en a une.</param>
    /// <param name="requested">Le paramètre <c>userId</c> de la requête.</param>
    /// <returns>L'identifiant retenu, ou <c>null</c> sans compte à filtrer.</returns>
    public static Guid? Choose(string? claim, Guid? requested)
    {
        if (FromClaim(claim) is { } own)
        {
            return own;
        }

        return requested.HasValue && requested.Value != Guid.Empty ? requested.Value : null;
    }

    /// <summary>
    /// Lit le compte porté par le jeton.
    /// </summary>
    /// <param name="claim">La valeur de la revendication d'utilisateur du jeton, s'il y en a une.</param>
    /// <returns>L'identifiant du compte, ou <c>null</c> pour un appel par clé d'API.</returns>
    public static Guid? FromClaim(string? claim)
        => Guid.TryParse(claim, out var own) && own != Guid.Empty ? own : null;
}
