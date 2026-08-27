using System;
using System.Collections.Concurrent;
using JellyfinCarouselPlugin.Models;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Implémentation de <see cref="ICatalogStore"/>, adossée au disque.
/// Même principe que <see cref="TopListStore"/> : lecture sans verrou, dernier état connu
/// relu au démarrage.
/// </summary>
public sealed class CatalogStore : ICatalogStore
{
    private readonly ConcurrentDictionary<CatalogKind, CatalogSnapshot> _snapshots = new();
    private readonly SnapshotStorage _storage;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="CatalogStore"/>.
    /// </summary>
    /// <param name="storage">Persistance des instantanés.</param>
    public CatalogStore(SnapshotStorage storage)
    {
        _storage = storage;

        foreach (var kind in Enum.GetValues<CatalogKind>())
        {
            _snapshots[kind] = _storage.LoadCatalog(kind) ?? CatalogSnapshot.Empty(kind);
        }
    }

    /// <inheritdoc />
    public CatalogSnapshot Get(CatalogKind kind)
        => _snapshots.TryGetValue(kind, out var snapshot) ? snapshot : CatalogSnapshot.Empty(kind);

    /// <inheritdoc />
    public void Publish(CatalogSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        _snapshots[snapshot.Kind] = snapshot;
        _storage.SaveCatalog(snapshot);
    }
}
