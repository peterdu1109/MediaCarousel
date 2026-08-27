using System;
using System.Threading;
using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Implémentation en mémoire de <see cref="ITopListStore"/>.
/// Chaque instantané étant immuable, une simple publication atomique de la référence suffit :
/// aucun verrou n'est nécessaire côté lecture.
/// </summary>
public sealed class TopListStore : ITopListStore
{
    private TopListSnapshot _local = TopListSnapshot.Empty(TopListKind.Local);
    private TopListSnapshot _global = TopListSnapshot.Empty(TopListKind.Global);

    /// <inheritdoc />
    public TopListSnapshot Get(TopListKind kind) => kind switch
    {
        TopListKind.Local => Volatile.Read(ref _local),
        TopListKind.Global => Volatile.Read(ref _global),
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    /// <inheritdoc />
    public void Publish(TopListSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        switch (snapshot.Kind)
        {
            case TopListKind.Local:
                Volatile.Write(ref _local, snapshot);
                break;
            case TopListKind.Global:
                Volatile.Write(ref _global, snapshot);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(snapshot));
        }
    }
}
