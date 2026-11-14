using System;
using System.Security.Cryptography;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Étiquette de validation du script servi à la page d'accueil.
/// </summary>
/// <remarks>
/// La version du plugin seule ne suffit pas : un correctif du script publié sans changement de
/// version gardait le même <c>ETag</c>, et les clients (WebView des TV comprises) répondaient
/// <c>304</c> en gardant l'ancien script. Un condensat du contenu s'y ajoute : l'étiquette change
/// dès que le script change, et seulement alors.
/// </remarks>
public static class ScriptEtag
{
    /// <summary>
    /// Construit l'étiquette « version-condensat » du contenu donné.
    /// </summary>
    /// <param name="version">Version du plugin.</param>
    /// <param name="content">Octets du script.</param>
    /// <returns>L'étiquette, sans guillemets.</returns>
    public static string Of(string version, byte[] content)
    {
        var hash = SHA256.HashData(content);
        return version + "-" + Convert.ToHexString(hash, 0, 4).ToLowerInvariant();
    }
}
