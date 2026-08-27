using System;
using System.Threading;
using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Implémentation en mémoire de <see cref="ICatalogStore"/>.
/// Même principe que <see cref="TopListStore"/> : les instantanés sont immuables,
/// une publication atomique de la référence suffit.
/// </summary>
public sealed class CatalogStore : ICatalogStore
{
    private CatalogSnapshot _studios = CatalogSnapshot.Empty(CatalogKind.Studios);
    private CatalogSnapshot _genres = CatalogSnapshot.Empty(CatalogKind.Genres);

    /// <inheritdoc />
    public CatalogSnapshot Get(CatalogKind kind) => kind switch
    {
        CatalogKind.Studios => Volatile.Read(ref _studios),
        CatalogKind.Genres => Volatile.Read(ref _genres),
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    /// <inheritdoc />
    public void Publish(CatalogSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        switch (snapshot.Kind)
        {
            case CatalogKind.Studios:
                Volatile.Write(ref _studios, snapshot);
                break;
            case CatalogKind.Genres:
                Volatile.Write(ref _genres, snapshot);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(snapshot));
        }
    }
}
