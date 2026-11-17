using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.EvidenceBridge.Contracts;
using WaroTrans.EvidenceBridge.Features.Capture;
using WaroTrans.EvidenceBridge.Services;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.EvidenceBridge.Features.TrafficTap;

/// <summary>
/// Traffic publishes no integration event, so this reads its snapshot every second and records when a robot starts,
/// changes or stops waiting (capacity, wait-for cycle, behind whom, where it stands). Traffic code is not touched.
/// </summary>
internal sealed class TrafficEvidenceTap(
    IServiceProvider services,
    IServiceScopeFactory scopes,
    IOptions<EvidenceBridgeOptions> options,
    TimeProvider clock,
    ILogger<TrafficEvidenceTap> logger) : BackgroundService
{
    private readonly Dictionary<Guid, (TrafficWaitingReason Reason, Guid? Owner)> _last = [];
    private readonly Dictionary<Guid, string> _codes = [];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled || services.GetService<ISegmentedTrafficCoordinator>() is not { } traffic)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TapOnceAsync(traffic, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogDebug(ex, "Evidence traffic tap pass failed");
            }

            await Task.Delay(TimeSpan.FromMilliseconds(Math.Max(250, options.Value.TrafficTapIntervalMs)), clock, stoppingToken);
        }
    }

    internal async Task TapOnceAsync(ISegmentedTrafficCoordinator traffic, CancellationToken cancellationToken)
    {
        var snapshot = await traffic.GetTrafficSnapshotAsync(cancellationToken);
        var changed = new List<(RobotTrafficView Robot, TrafficWaitingReason Previous)>();
        foreach (var robot in snapshot.Robots)
        {
            (TrafficWaitingReason Reason, Guid? Owner) previous = _last.TryGetValue(robot.RobotId, out var p) ? p : (TrafficWaitingReason.None, null);
            if (previous.Reason != robot.WaitingReason || previous.Owner != robot.BlockingOwner)
            {
                changed.Add((robot, previous.Reason));
            }

            _last[robot.RobotId] = (robot.WaitingReason, robot.BlockingOwner);
        }

        if (changed.Count == 0)
        {
            return;
        }

        await using var scope = scopes.CreateAsyncScope();
        var outbox = scope.ServiceProvider.GetRequiredService<EvidenceOutboxWriter>();
        var fleet = scope.ServiceProvider.GetRequiredService<IFleetModule>();
        var now = clock.GetUtcNow();
        foreach (var (robot, previous) in changed)
        {
            var code = await CodeAsync(fleet, robot.RobotId, cancellationToken);
            var owner = robot.BlockingOwner is { } ownerId ? await CodeAsync(fleet, ownerId, cancellationToken) : null;
            var payload = JsonSerializer.SerializeToElement(new
            {
                waitingReason = robot.WaitingReason.ToString(),
                previousReason = previous.ToString(),
                blockingOwnerRobotId = robot.BlockingOwner,
                blockingOwnerCode = owner,
                phase = robot.Phase.ToString(),
                x = robot.X,
                y = robot.Y,
                localizationOk = robot.LocalizationOk,
                jobStepId = robot.JobStepId,
                epoch = snapshot.Epoch
            }, EvidenceOutboxWriter.Json);
            await outbox.WriteAsync(new EvidenceEnvelope(
                Guid.NewGuid(), EvidenceEnvelope.CurrentSchemaVersion, EvidenceEventTypes.TrafficWaitChanged, now,
                EvidenceEnvelope.CoreSource, null, null, null, null, robot.JobStepId, robot.RobotId, code, null,
                robot.WaitingReason.ToString(), payload), cancellationToken);
        }
    }

    private async Task<string?> CodeAsync(IFleetModule fleet, Guid robotId, CancellationToken cancellationToken)
    {
        if (_codes.TryGetValue(robotId, out var code))
        {
            return code;
        }

        code = (await fleet.GetRobotAsync(robotId, cancellationToken))?.Code;
        if (code is not null)
        {
            _codes[robotId] = code;
        }

        return code;
    }
}
