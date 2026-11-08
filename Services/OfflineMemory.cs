using System;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Retient un court instant qu'un service externe ne répond pas, pour ne pas lui reposer la
/// question à chaque titre.
/// </summary>
/// <remarks>
/// Un Seerr muet coûte son délai complet (15 s) à chaque lecture d'état : vingt titres lus quatre
/// à la fois faisaient attendre environ 75 s. Après un premier échec, les lectures suivantes
/// échouent aussitôt pendant <c>lifetime</c>, puis la question est reposée. Seuls les échecs de
/// connexion et les 5xx sont retenus, jamais un refus de clé ou un titre inconnu.
/// </remarks>
public sealed class OfflineMemory
{
    private readonly object _lock = new();
    private readonly TimeSpan _lifetime;
    private string? _address;
    private DateTime _untilUtc = DateTime.MinValue;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="OfflineMemory"/>.
    /// </summary>
    /// <param name="lifetime">Durée pendant laquelle le service est tenu pour injoignable.</param>
    public OfflineMemory(TimeSpan lifetime)
    {
        _lifetime = lifetime;
    }

    /// <summary>
    /// Dit si le service à cette adresse est tenu pour injoignable à cet instant.
    /// </summary>
    /// <param name="address">L'adresse du service ; un autre réglage d'adresse repart de zéro.</param>
    /// <param name="nowUtc">L'instant, en UTC.</param>
    /// <returns><see langword="true"/> si l'appel doit échouer sans attendre.</returns>
    public bool IsOffline(string address, DateTime nowUtc)
    {
        lock (_lock)
        {
            return string.Equals(_address, address, StringComparison.Ordinal) && nowUtc < _untilUtc;
        }
    }

    /// <summary>
    /// Retient que le service à cette adresse vient de ne pas répondre.
    /// </summary>
    /// <param name="address">L'adresse du service.</param>
    /// <param name="nowUtc">L'instant, en UTC.</param>
    public void RecordFailure(string address, DateTime nowUtc)
    {
        lock (_lock)
        {
            _address = address;
            _untilUtc = nowUtc + _lifetime;
        }
    }

    /// <summary>
    /// Oublie l'échec retenu : le service vient de répondre.
    /// </summary>
    public void Clear()
    {
        lock (_lock)
        {
            _address = null;
            _untilUtc = DateTime.MinValue;
        }
    }
}
