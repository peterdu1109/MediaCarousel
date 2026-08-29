using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MediaBrowser.Controller.Entities;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Décide si un élément de la bibliothèque entre dans les classements.
/// </summary>
/// <remarks>
/// La règle était recopiée à l'identique dans trois services, avec sa propre lecture des
/// identifiants exclus. Elle vit ici pour qu'un critère ajouté s'applique partout d'un coup —
/// une rangée qui aurait été oubliée afficherait des titres que les autres écartent.
/// </remarks>
public static class LibraryFilter
{
    /// <summary>
    /// Indique si un élément doit être écarté des classements.
    /// </summary>
    /// <param name="item">L'élément examiné.</param>
    /// <param name="excludedLibraries">Les identifiants des bibliothèques exclues.</param>
    /// <param name="excludeChannelContent">Vrai pour écarter le contenu des plugins de chaîne.</param>
    /// <returns>Vrai si l'élément doit être ignoré.</returns>
    public static bool IsExcluded(
        BaseItem item,
        IReadOnlyCollection<Guid> excludedLibraries,
        bool excludeChannelContent)
    {
        ArgumentNullException.ThrowIfNull(item);
        ArgumentNullException.ThrowIfNull(excludedLibraries);

        // Contenu servi par un plugin de chaîne — XFusion et les autres passerelles IPTV.
        // `ChannelId` en est le seul marqueur fiable : ces éléments entrent en base comme des
        // `Movie` et des `Episode` ordinaires, exactement les types que les classements
        // interrogent, et ils ne se distinguent ni par leur chemin ni par leur type.
        //
        // Les écarter n'est pas une préférence de goût. Un catalogue IPTV compte couramment
        // plus de titres que toute la bibliothèque locale, et il est reconstruit à chaque
        // rafraîchissement du fournisseur : ses `DateCreated` sont donc perpétuellement
        // récentes, ce qui suffit à remplir « de retour cette semaine » à lui seul. Ses
        // studios et ses genres écrasent de même les catalogues locaux.
        if (excludeChannelContent && item.ChannelId != Guid.Empty)
        {
            return true;
        }

        if (excludedLibraries.Count == 0)
        {
            return false;
        }

        var topParent = item.GetTopParent();
        return topParent is not null && excludedLibraries.Contains(topParent.Id);
    }

    /// <summary>
    /// Lit une liste d'identifiants de configuration en ignorant les valeurs invalides.
    /// </summary>
    /// <param name="values">Les valeurs enregistrées.</param>
    /// <returns>Les identifiants exploitables.</returns>
    public static HashSet<Guid> ParseGuids(IEnumerable<string>? values)
    {
        var result = new HashSet<Guid>();

        if (values is null)
        {
            return result;
        }

        foreach (var value in values)
        {
            // Une valeur saisie à la main dans la page de configuration : une faute de frappe
            // ne doit pas faire échouer tout le recalcul.
            if (Guid.TryParse(value, CultureInfo.InvariantCulture, out var guid))
            {
                result.Add(guid);
            }
        }

        return result;
    }
}
