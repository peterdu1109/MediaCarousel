using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Models;
using MediaBrowser.Controller.Collections;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Matérialise un classement sous forme de collection Jellyfin.
/// C'est le seul moyen de rendre une liste générée visible dans les clients existants
/// sans toucher au frontend : une collection est un <c>BoxSet</c> pré-trié, l'ordre de ses
/// enfants liés est donc l'ordre du classement.
/// </summary>
public sealed class CollectionSynchronizer
{
    private readonly ICollectionManager _collectionManager;
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<CollectionSynchronizer> _logger;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="CollectionSynchronizer"/>.
    /// </summary>
    /// <param name="collectionManager">Gestionnaire de collections.</param>
    /// <param name="libraryManager">Gestionnaire de bibliothèque.</param>
    /// <param name="logger">Journal.</param>
    public CollectionSynchronizer(
        ICollectionManager collectionManager,
        ILibraryManager libraryManager,
        ILogger<CollectionSynchronizer> logger)
    {
        _collectionManager = collectionManager;
        _libraryManager = libraryManager;
        _logger = logger;
    }

    /// <summary>
    /// Aligne le contenu d'une collection sur un classement.
    /// </summary>
    /// <param name="snapshot">Classement source.</param>
    /// <param name="collectionName">Nom de la collection à créer si elle n'existe pas.</param>
    /// <param name="existingCollectionId">Identifiant mémorisé de la collection, ou <see cref="Guid.Empty"/>.</param>
    /// <param name="cancellationToken">Jeton d'annulation.</param>
    /// <returns>L'identifiant de la collection, éventuellement nouvellement créée.</returns>
    public async Task<Guid> SyncAsync(
        TopListSnapshot snapshot,
        string collectionName,
        Guid existingCollectionId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        var desired = snapshot.Entries
            .Where(e => e.IsInLibrary)
            .Select(e => e.ItemId)
            .Distinct()
            .ToArray();

        if (desired.Length == 0)
        {
            _logger.LogInformation("Collection « {Name} » non synchronisée : aucun titre présent dans la bibliothèque.", collectionName);
            return existingCollectionId;
        }

        var boxSet = existingCollectionId == Guid.Empty
            ? null
            : _libraryManager.GetItemById(existingCollectionId) as BoxSet;

        if (boxSet is null)
        {
            // Collection absente ou supprimée par l'administrateur : on la recrée avec le bon contenu.
            var created = await _collectionManager.CreateCollectionAsync(new CollectionCreationOptions
            {
                Name = collectionName,
                IsLocked = true,
                ItemIdList = desired.Select(id => id.ToString("N", CultureInfo.InvariantCulture)).ToArray()
            }).ConfigureAwait(false);

            _logger.LogInformation("Collection « {Name} » créée avec {Count} titre(s).", collectionName, desired.Length);
            return created.Id;
        }

        var current = boxSet.GetLinkedChildren().Select(i => i.Id).ToArray();

        if (current.SequenceEqual(desired))
        {
            _logger.LogDebug("Collection « {Name} » déjà à jour.", collectionName);
            return boxSet.Id;
        }

        cancellationToken.ThrowIfCancellationRequested();

        // Le rang fait partie du résultat : on réécrit l'ensemble pour garantir l'ordre,
        // plutôt que d'ajouter et retirer les seules différences.
        if (current.Length > 0)
        {
            await _collectionManager.RemoveFromCollectionAsync(boxSet.Id, current).ConfigureAwait(false);
        }

        await _collectionManager.AddToCollectionAsync(boxSet.Id, desired).ConfigureAwait(false);

        _logger.LogInformation("Collection « {Name} » synchronisée : {Count} titre(s).", collectionName, desired.Length);
        return boxSet.Id;
    }
}
