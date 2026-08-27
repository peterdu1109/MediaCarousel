using System;
using System.Collections.Concurrent;
using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Implémentation de <see cref="ITopListStore"/>, adossée au disque.
/// </summary>
/// <remarks>
/// Chaque instantané étant immuable, la lecture est sans verrou. Le dernier instantané connu
/// est relu au démarrage : les rangées s'affichent immédiatement après un redémarrage du
/// serveur, sans attendre la fin du premier recalcul.
/// </remarks>
public sealed class TopListStore : ITopListStore
{
    private readonly ConcurrentDictionary<TopListKind, TopListSnapshot> _snapshots = new();
    private readonly SnapshotStorage _storage;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="TopListStore"/>.
    /// </summary>
    /// <param name="storage">Persistance des instantanés.</param>
    public TopListStore(SnapshotStorage storage)
    {
        _storage = storage;

        foreach (var kind in Enum.GetValues<TopListKind>())
        {
            _snapshots[kind] = _storage.LoadTopList(kind) ?? TopListSnapshot.Empty(kind);
        }
    }

    /// <inheritdoc />
    public TopListSnapshot Get(TopListKind kind)
        => _snapshots.TryGetValue(kind, out var snapshot) ? snapshot : TopListSnapshot.Empty(kind);

    /// <inheritdoc />
    public void Publish(TopListSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        _snapshots[snapshot.Kind] = snapshot;
        _storage.SaveTopList(snapshot);
    }
}
