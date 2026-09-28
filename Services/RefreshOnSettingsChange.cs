using System;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using JellyfinCarouselPlugin.Configuration;
using MediaBrowser.Model.Plugins;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JellyfinCarouselPlugin.Services;

/// <summary>
/// Relance le recalcul des rangées dès qu'un enregistrement change les réglages.
/// </summary>
/// <remarks>
/// Sans lui, un réglage enregistré n'agissait qu'au recalcul suivant, parfois des heures plus
/// tard. Constaté en prod le 2026-09-28 : cocher « une rangée pour les films, une pour les
/// séries » faisait disparaître le Top mondial en attendant, et Elie a décoché. Le délai
/// regroupe les enregistrements rapprochés ; un recalcul déjà en cours a lu l'ancienne
/// configuration, on attend donc qu'il finisse pour relancer.
/// </remarks>
public sealed class RefreshOnSettingsChange : IHostedService, IDisposable
{
    private static readonly TimeSpan Delay = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan BusyRetry = TimeSpan.FromSeconds(15);

    private readonly TopListRefreshService _refreshService;
    private readonly ILogger<RefreshOnSettingsChange> _logger;
    private readonly Timer _timer;
    private readonly object _lock = new();
    private EventHandler<BasePluginConfiguration>? _handler;
    private string? _signature;

    /// <summary>
    /// Initialise une nouvelle instance de la classe <see cref="RefreshOnSettingsChange"/>.
    /// </summary>
    /// <param name="refreshService">Service de recalcul.</param>
    /// <param name="logger">Journal.</param>
    public RefreshOnSettingsChange(TopListRefreshService refreshService, ILogger<RefreshOnSettingsChange> logger)
    {
        _refreshService = refreshService;
        _logger = logger;
        _timer = new Timer(OnTimer, null, Timeout.Infinite, Timeout.Infinite);
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var plugin = Plugin.Instance;
        if (plugin is null)
        {
            return Task.CompletedTask;
        }

        lock (_lock)
        {
            _signature = Signature(plugin.Configuration);
        }

        _handler = (_, configuration) => OnChanged(configuration as PluginConfiguration ?? plugin.Configuration);
        plugin.ConfigurationChanged += _handler;
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        if (_handler is not null && Plugin.Instance is not null)
        {
            Plugin.Instance.ConfigurationChanged -= _handler;
            _handler = null;
        }

        _timer.Change(Timeout.Infinite, Timeout.Infinite);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _timer.Dispose();
    }

    private static string Signature(PluginConfiguration configuration)
        => SettingsSignature.Of(JsonSerializer.SerializeToNode(configuration) as JsonObject);

    private void OnChanged(PluginConfiguration configuration)
    {
        var signature = Signature(configuration);

        lock (_lock)
        {
            // Le recalcul enregistre lui-même les identifiants de ses collections : cet
            // enregistrement-là ne change rien d'autre, il ne relance rien.
            if (string.Equals(signature, _signature, StringComparison.Ordinal))
            {
                return;
            }

            _signature = signature;
        }

        _logger.LogInformation("Réglages enregistrés : recalcul des rangées dans {Delay}.", Delay);
        _timer.Change(Delay, Timeout.InfiniteTimeSpan);
    }

    private void OnTimer(object? state)
    {
        if (_refreshService.IsRefreshing)
        {
            _timer.Change(BusyRetry, Timeout.InfiniteTimeSpan);
            return;
        }

        _ = RunAsync();
    }

    private async Task RunAsync()
    {
        try
        {
            await _refreshService.RefreshAsync(null, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Échec du recalcul lancé par l'enregistrement des réglages.");
        }
    }
}
