using System;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Libellé retenu pour représenter un groupe de variantes d'un même nom.
/// </summary>
/// <remarks>
/// Les fournisseurs de métadonnées écrivent la même société sous plusieurs libellés —
/// « Warner Bros. », « Warner Bros. Pictures », « Warner Bros. Animation ». Un seul est
/// affiché, et le choix n'est pas indifférent : la rangée montre des logos, donc une
/// variante illustrée l'emporte sur une variante mieux fournie, sans quoi le studio
/// apparaîtrait comme un simple libellé au milieu d'images.
/// </remarks>
/// <param name="ItemId">Identifiant Jellyfin de la variante retenue.</param>
/// <param name="Name">Libellé affiché.</param>
/// <param name="HasLogo">La variante possède un logo ou une vignette.</param>
/// <param name="VariantCount">Nombre de titres portant exactement ce libellé.</param>
public readonly record struct CatalogRepresentative(
    Guid ItemId,
    string Name,
    bool HasLogo,
    int VariantCount)
{
    /// <summary>
    /// Indique si une variante concurrente doit prendre la place de celle-ci.
    /// </summary>
    /// <param name="hasLogo">La variante concurrente possède un logo.</param>
    /// <param name="variantCount">Nombre de titres portant la variante concurrente.</param>
    /// <returns><see langword="true"/> si la concurrente l'emporte.</returns>
    public bool IsBeatenBy(bool hasLogo, int variantCount)
        => (hasLogo && !HasLogo) || (hasLogo == HasLogo && variantCount > VariantCount);
}
