using System;
using System.Collections.Generic;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Compte les titres rattachés à chaque nom — studio ou genre — en distinguant la
/// bibliothèque d'origine.
/// </summary>
/// <remarks>
/// <para>
/// Cette classe existe parce que les décomptes renvoyés par Jellyfin ne sont pas
/// exploitables. Dans <c>BaseItemRepository.GetItemValues</c> (10.11.11), l'objet
/// <c>ItemCounts</c> attaché à chaque studio ou genre est calculé à partir d'un
/// <c>itemCountQuery</c> qui n'est corrélé à aucune ligne du résultat : la même valeur est
/// donc renvoyée pour toutes les entrées — le nombre total de titres possédant un studio
/// (respectivement un genre), quel qu'il soit. Le code amont porte d'ailleurs un
/// <c>// TODO: This is bad refactor!</c> à cet endroit.
/// </para>
/// <para>
/// Conséquence : classer les studios sur ces décomptes revient à les classer sur le nombre
/// de variantes d'écriture de leur nom, et les seuils <c>MinItemsPerStudio</c> et
/// <c>MinItemsPerGenre</c> ne filtrent rien ou filtrent tout. Le comptage est donc refait
/// ici, à partir des titres eux-mêmes.
/// </para>
/// <para>
/// La ventilation par bibliothèque n'est pas un raffinement du classement : c'est ce qui
/// permet, à la lecture, de ne sommer que les bibliothèques auxquelles l'appelant a accès.
/// </para>
/// </remarks>
public sealed class CatalogCounter
{
    private readonly Func<string, string> _keySelector;
    private readonly Dictionary<string, CatalogCount> _buckets;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="CatalogCounter"/>.
    /// </summary>
    /// <param name="keySelector">
    /// Réduit un nom à la clé sous laquelle ses variantes sont regroupées.
    /// </param>
    /// <param name="keyComparer">Comparateur appliqué aux clés produites.</param>
    public CatalogCounter(Func<string, string> keySelector, StringComparer keyComparer)
    {
        ArgumentNullException.ThrowIfNull(keySelector);
        ArgumentNullException.ThrowIfNull(keyComparer);

        _keySelector = keySelector;
        _buckets = new Dictionary<string, CatalogCount>(keyComparer);
    }

    /// <summary>
    /// Obtient les regroupements constitués, indexés par clé.
    /// </summary>
    public IReadOnlyDictionary<string, CatalogCount> Buckets => _buckets;

    /// <summary>
    /// Comptabilise un titre rattaché à un nom, dans une bibliothèque donnée.
    /// </summary>
    /// <param name="name">Nom du studio ou du genre, tel qu'écrit par la source.</param>
    /// <param name="libraryId">Bibliothèque dont provient le titre.</param>
    public void Add(string? name, Guid libraryId)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return;
        }

        var trimmed = name.Trim();
        var key = _keySelector(trimmed);

        // Un nom que le normaliseur réduit à rien ne peut pas servir de clé de regroupement :
        // toutes ces entrées se retrouveraient fusionnées sous une clé vide.
        if (key.Length == 0)
        {
            return;
        }

        if (!_buckets.TryGetValue(key, out var bucket))
        {
            bucket = new CatalogCount();
            _buckets[key] = bucket;
        }

        bucket.Add(trimmed, libraryId);
    }
}

/// <summary>
/// Décomptes accumulés pour un nom et ses variantes d'écriture.
/// </summary>
public sealed class CatalogCount
{
    private readonly Dictionary<Guid, int> _byLibrary = new();
    private readonly Dictionary<string, int> _byVariant = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Obtient le nombre total de titres, toutes bibliothèques et toutes variantes confondues.
    /// </summary>
    public int Total { get; private set; }

    /// <summary>
    /// Obtient le nombre de titres par bibliothèque.
    /// </summary>
    public IReadOnlyDictionary<Guid, int> ByLibrary => _byLibrary;

    /// <summary>
    /// Obtient le nombre de titres par variante d'écriture du nom.
    /// </summary>
    /// <remarks>
    /// Sert à départager les variantes lorsqu'aucune ne possède de logo : c'est la mieux
    /// fournie qui représente le groupe.
    /// </remarks>
    public IReadOnlyDictionary<string, int> ByVariant => _byVariant;

    /// <summary>
    /// Comptabilise un titre pour une variante et une bibliothèque.
    /// </summary>
    /// <param name="variant">Nom exact tel qu'écrit par la source.</param>
    /// <param name="libraryId">Bibliothèque dont provient le titre.</param>
    public void Add(string variant, Guid libraryId)
    {
        Total++;

        _byLibrary.TryGetValue(libraryId, out var libraryCount);
        _byLibrary[libraryId] = libraryCount + 1;

        _byVariant.TryGetValue(variant, out var variantCount);
        _byVariant[variant] = variantCount + 1;
    }

    /// <summary>
    /// Additionne les décomptes des bibliothèques indiquées.
    /// </summary>
    /// <param name="libraryIds">Bibliothèques à prendre en compte.</param>
    /// <returns>Le nombre de titres visibles dans ces bibliothèques.</returns>
    public int CountIn(IReadOnlyCollection<Guid> libraryIds)
    {
        ArgumentNullException.ThrowIfNull(libraryIds);

        var total = 0;
        foreach (var libraryId in libraryIds)
        {
            if (_byLibrary.TryGetValue(libraryId, out var count))
            {
                total += count;
            }
        }

        return total;
    }
}
