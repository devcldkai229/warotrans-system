using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// One authoritative traffic coordinator per database. <see cref="TrafficState"/> is in-memory and single-writer, so
/// two hosts against the same robots would hand out overlapping grants. This service holds a Postgres session
/// advisory lock for the host's lifetime; only while it holds the lock — and after announcing its epoch to the robots
/// (retained MQTT) — does the coordinator grant motion. Losing the connection closes grants until it is re-acquired.
/// Not a distributed consensus: it relies on the single Postgres the hosts share.
/// </summary>
public sealed class TrafficCoordinatorLeaseHostedService(
    ISegmentedTrafficCoordinator coordinator,
    IServiceScopeFactory scopeFactory,
    IMqttTrafficEpochPublisher epochPublisher,
    RobotIngressGate ingressGate,
    IOptions<TrafficOptions> options,
    ILogger<TrafficCoordinatorLeaseHostedService> logger) : BackgroundService
{
    public override Task StartAsync(CancellationToken cancellationToken)
    {
        // Standby until the lease is held. Hosted services all exist before any of them starts, but they start in
        // order: closing here keeps a host that will not get the lease from handling a first burst of uplink.
        if (options.Value.RequireCoordinatorLease)
        {
            ingressGate.SetActive(false);
        }

        return base.StartAsync(cancellationToken);
    }

    /// <summary>Advisory lock key (any stable 64-bit value private to this purpose).</summary>
    public const long LeaseKey = 0x5741524F_54524146; // "WAROTRAF"

    private static readonly TimeSpan RetryInterval = TimeSpan.FromSeconds(3);
    private readonly Guid _coordinatorId = Guid.NewGuid();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.RequireCoordinatorLease)
        {
            return;
        }

        string? connectionString;
        await using (var scope = scopeFactory.CreateAsyncScope())
        {
            connectionString = scope.ServiceProvider.GetRequiredService<FleetDbContext>().Database.GetConnectionString();
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await HoldLeaseAsync(connectionString!, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Traffic coordinator lease lost; grants closed");
            }

            ingressGate.SetActive(false);
            await coordinator.SetOpenForGrantsAsync(false, "lease-lost", CancellationToken.None).ConfigureAwait(false);
            try
            {
                await Task.Delay(RetryInterval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task HoldLeaseAsync(string connectionString, CancellationToken ct)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(ct).ConfigureAwait(false);

        await using (var acquire = new NpgsqlCommand("SELECT pg_try_advisory_lock(@key)", connection))
        {
            acquire.Parameters.AddWithValue("key", LeaseKey);
            if (await acquire.ExecuteScalarAsync(ct).ConfigureAwait(false) is not true)
            {
                logger.LogError(
                    "Traffic coordinator lease is held by another host: this host grants NO motion (NOT_LEADER)");
                return;
            }
        }

        // Holding the lease now: what this host knew as a standby is void. New epoch, occupancy rebuilt from the
        // database (a robot that was driving under the previous leader is quarantined until it reports in).
        long epoch;
        await using (var scope = scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var (seeds, _) = await TrafficReconciliationHostedService.BuildSeedsAsync(db, ct).ConfigureAwait(false);
            epoch = await coordinator.TakeOverAsync(seeds, ct).ConfigureAwait(false);
        }

        // Uplink first: robots answer the epoch with authority_state straight away, and that reconcile must not be lost.
        ingressGate.SetActive(true);

        // The epoch must reach the robots before any grant of it: they then drop every older grant at once.
        await epochPublisher.PublishEpochAsync(new TrafficEpochMessage
        {
            Epoch = epoch,
            CoordinatorId = _coordinatorId,
            StartedAt = DateTimeOffset.UtcNow
        }, ct).ConfigureAwait(false);
        await coordinator.SetOpenForGrantsAsync(true, $"lease-held:{_coordinatorId:N}", ct).ConfigureAwait(false);
        logger.LogInformation("Traffic coordinator lease held; epoch {Epoch} announced, grants open", epoch);

        // Keep the session alive; any failure means the lock may be gone.
        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(RetryInterval, ct).ConfigureAwait(false);
            await using var ping = new NpgsqlCommand("SELECT 1", connection);
            await ping.ExecuteScalarAsync(ct).ConfigureAwait(false);
        }
    }
}
