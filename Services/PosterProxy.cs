using System;
using System.Text.RegularExpressions;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Traduit les adresses d'affiches externes en adresses servies par le plugin.
/// </summary>
/// <remarks>
/// <para>
/// Le Top mondial peut classer des titres absents de la bibliothèque ; leur affiche vient
/// alors de TMDB. Servie telle quelle, elle ferait tomber chaque navigateur d'un
/// utilisateur sur <c>image.tmdb.org</c> : cela communique l'adresse IP de chacun de tes
/// utilisateurs à un tiers, et sur un serveur dont les clients n'ont pas d'accès Internet
/// sortant, l'affiche ne s'affiche tout simplement pas.
/// </para>
/// <para>
/// Le proxy ne reçoit jamais d'URL du client : seulement un nom de fichier, dont la forme
/// est vérifiée ici. L'hôte distant est une constante du plugin, si bien qu'aucune requête
/// ne peut être détournée vers une adresse choisie par l'appelant.
/// </para>
/// </remarks>
public static class PosterProxy
{
    /// <summary>
    /// Route publique du proxy, sans le nom de fichier.
    /// </summary>
    public const string RoutePrefix = "/MediaCarousel/Poster/";

    private const string TmdbPrefix = "https://image.tmdb.org/t/p/";

    /// <summary>
    /// Taille demandée à TMDB. Les affiches des rangées font 120 px de large à l'écran,
    /// 342 px couvre donc les écrans à forte densité sans transférer inutilement.
    /// </summary>
    private const string TmdbSize = "w342";

    /// <summary>
    /// Noms de fichiers acceptés : ni séparateur, ni remontée de chemin, ni requête.
    /// </summary>
    private static readonly Regex FilePattern = new(
        @"^[A-Za-z0-9._-]{1,128}\.(jpg|jpeg|png|webp)$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    /// <summary>
    /// Convertit une adresse d'affiche externe en adresse servie par le plugin.
    /// </summary>
    /// <remarks>
    /// Une adresse que le plugin ne sait pas relayer est renvoyée inchangée : mieux vaut une
    /// affiche chargée depuis sa source qu'une vignette vide.
    /// </remarks>
    /// <param name="posterUrl">Adresse d'origine, éventuellement <see langword="null"/>.</param>
    /// <returns>L'adresse à publier au client.</returns>
    public static string? ToLocalUrl(string? posterUrl)
        => TryGetFileName(posterUrl, out var fileName) ? RoutePrefix + fileName : posterUrl;

    /// <summary>
    /// Extrait le nom de fichier d'une adresse d'affiche TMDB.
    /// </summary>
    /// <param name="posterUrl">Adresse d'origine.</param>
    /// <param name="fileName">Nom de fichier extrait, si l'adresse est relayable.</param>
    /// <returns><see langword="true"/> si l'adresse peut être relayée.</returns>
    public static bool TryGetFileName(string? posterUrl, out string fileName)
    {
        fileName = string.Empty;

        if (string.IsNullOrEmpty(posterUrl)
            || !posterUrl.StartsWith(TmdbPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var lastSlash = posterUrl.LastIndexOf('/');
        if (lastSlash < 0 || lastSlash == posterUrl.Length - 1)
        {
            return false;
        }

        var candidate = posterUrl[(lastSlash + 1)..];
        if (!IsValidFileName(candidate))
        {
            return false;
        }

        fileName = candidate;
        return true;
    }

    /// <summary>
    /// Vérifie qu'un nom de fichier reçu du client est acceptable.
    /// </summary>
    /// <param name="fileName">Nom de fichier à vérifier.</param>
    /// <returns><see langword="true"/> si le nom est acceptable.</returns>
    public static bool IsValidFileName(string? fileName)
        => !string.IsNullOrEmpty(fileName)
            && !fileName.Contains("..", StringComparison.Ordinal)
            && FilePattern.IsMatch(fileName);

    /// <summary>
    /// Construit l'adresse distante à partir d'un nom de fichier déjà validé.
    /// </summary>
    /// <param name="fileName">Nom de fichier validé par <see cref="IsValidFileName"/>.</param>
    /// <returns>L'adresse TMDB de l'affiche.</returns>
    public static string BuildRemoteUrl(string fileName)
        => TmdbPrefix + TmdbSize + "/" + fileName;
}
