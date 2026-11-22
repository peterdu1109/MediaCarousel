using System;
using System.Collections.Concurrent;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Mémoire à durée de vie limitée et à taille plafonnée, pour des clés dont une part vient du client.
/// </summary>
/// <remarks>
/// Sans plafond, un compte qui varie la clé à chaque appel ferait grossir la mémoire du serveur
/// sans limite : les entrées expirées n'étaient jamais retirées, seulement ignorées à la lecture.
/// </remarks>
/// <typeparam name="T">Type de la valeur gardée.</typeparam>
public sealed class BoundedCache<T>
{
    private readonly ConcurrentDictionary<string, (T Value, DateTime At)> _entries = new(StringComparer.Ordinal);
    private readonly TimeSpan _lifetime;
    private readonly int _capacity;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="BoundedCache{T}"/>.
    /// </summary>
    /// <param name="lifetime">Durée pendant laquelle une entrée est servie.</param>
    /// <param name="capacity">Nombre maximal d'entrées gardées.</param>
    public BoundedCache(TimeSpan lifetime, int capacity)
    {
        _lifetime = lifetime;
        _capacity = capacity;
    }

    /// <summary>
    /// Gets le nombre d'entrées gardées, expirées comprises tant qu'elles n'ont pas été retirées.
    /// </summary>
    public int Count => _entries.Count;

    /// <summary>
    /// Cherche une entrée encore valable.
    /// </summary>
    /// <param name="key">La clé.</param>
    /// <param name="now">L'heure courante.</param>
    /// <param name="value">La valeur trouvée.</param>
    /// <returns>Vrai si l'entrée existe et n'a pas expiré.</returns>
    public bool TryGet(string key, DateTime now, out T value)
    {
        if (_entries.TryGetValue(key, out var entry) && now - entry.At < _lifetime)
        {
            value = entry.Value;
            return true;
        }

        value = default!;
        return false;
    }

    /// <summary>
    /// Garde une valeur. Si le plafond est atteint, les entrées expirées sont d'abord retirées ;
    /// s'il n'y a toujours pas de place, la valeur n'est pas gardée (l'appel suivant la redemandera).
    /// </summary>
    /// <param name="key">La clé.</param>
    /// <param name="value">La valeur.</param>
    /// <param name="now">L'heure courante.</param>
    public void Set(string key, T value, DateTime now)
    {
        if (_entries.Count >= _capacity && !_entries.ContainsKey(key))
        {
            foreach (var pair in _entries)
            {
                if (now - pair.Value.At >= _lifetime)
                {
                    _entries.TryRemove(pair.Key, out _);
                }
            }

            if (_entries.Count >= _capacity)
            {
                return;
            }
        }

        _entries[key] = (value, now);
    }
}
