using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.IssueCancelCommand;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Services;

public sealed class RobotCommandTimeoutMonitorHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<MqttOptions> mqttOptions,
    RobotIngressGate ingressGate,
    ILogger<RobotCommandTimeoutMonitorHostedService> logger) : BackgroundService
{
    /// <summary>Time for the robot to cancel its goal at timeoutSeconds and get the RESULT back.</summary>
    private const double ResultGraceSeconds = 30;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Robot command timeout monitor tick failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        if (!ingressGate.IsActive)
        {
            return; // standby: ACKs are handled by the lease holder
        }

        var options = mqttOptions.Value;
        var timeout = TimeSpan.FromSeconds(Math.Max(1, options.CommandAckTimeoutSeconds));
        var cutoff = DateTimeOffset.UtcNow - timeout;
        // Never published (PublishedAt null): the issuing request is still connecting (bounded by the connect timeout)
        // or died before publishing (host crash). Only the latter is cleaned up, well after any connect could finish.
        var unpublishedCutoff = DateTimeOffset.UtcNow - timeout - TimeSpan.FromSeconds(Math.Max(1, options.ConnectTimeoutSeconds) * 3);

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var events = scope.ServiceProvider.GetRequiredService<IIntegrationEventPublisher>();

        // The robot has `timeout` to ACK from when the broker took the command, not from when the row was saved.
        var stale = await db.RobotCommands
            .Where(c => c.Status == RobotCommandStatus.SENT
                        && ((c.PublishedAt != null && c.PublishedAt < cutoff)
                            || (c.PublishedAt == null && c.IssuedAt < unpublishedCutoff)))
            .ToListAsync(cancellationToken);

        var utcNow = DateTimeOffset.UtcNow;
        foreach (var command in stale)
        {
            if (!command.TryMarkAckTimeout(utcNow))
            {
                continue;
            }

            var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == command.RobotId, cancellationToken);
            if (command.Type == RobotCommandType.NAVIGATE_TO_POSE)
            {
                robot?.MarkAvailable(utcNow);
                if (command.JobAssignmentId is { } assignmentId)
                {
                    var assignment = await db.JobAssignments.FirstOrDefaultAsync(
                        a => a.Id == assignmentId,
                        cancellationToken);
                    assignment?.TryEnd(AssignmentEndReason.ACK_TIMEOUT, utcNow);
                }

                var traffic = scope.ServiceProvider.GetRequiredService<ITrafficCoordinator>();
                if (command.JobStepId is { } stepId)
                {
                    traffic.ReleaseByJobStep(stepId);
                }
                else
                {
                    traffic.ReleaseGrant(command.RobotId);
                }
            }

            logger.LogWarning(
                "Command {CommandId} ACK timeout for robot {RobotId}",
                command.Id,
                command.RobotId);

            await events.PublishAsync(
                new RobotCommandLifecycleChanged(
                    command.Id,
                    command.RobotId,
                    robot?.Code ?? string.Empty,
                    command.Type.ToString(),
                    command.Status.ToString(),
                    command.JobAssignmentId,
                    command.JobStepId,
                    null,
                    command.ErrorCode,
                    RobotCommandLifecycleChanged.Phases.AckTimeout),
                cancellationToken);
        }

        // ACK received but RESULT never arrived (NAVIGATE stuck / robot crashed mid-move).
        var resultTimeoutSec = options.CommandResultTimeoutSeconds;
        if (resultTimeoutSec > 0)
        {
            var resultCutoff = utcNow - TimeSpan.FromSeconds(Math.Max(30, resultTimeoutSec));
            var overdue = await db.RobotCommands
                .Where(c => c.Type == RobotCommandType.NAVIGATE_TO_POSE
                            && (c.Status == RobotCommandStatus.ACKED || c.Status == RobotCommandStatus.RUNNING)
                            && c.AckedAt != null && c.AckedAt < resultCutoff)
                .ToListAsync(cancellationToken);
            // The robot enforces a command's own timeoutSeconds: give it the time to do that and report.
            var missingResult = overdue.Where(c =>
                    utcNow - c.AckedAt!.Value >= TimeSpan.FromSeconds(ResultDeadlineSeconds(c.PayloadJson, resultTimeoutSec)))
                .ToList();

            foreach (var command in missingResult)
            {
                var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == command.RobotId, cancellationToken);
                // Before the command closes (CANCEL needs an in-flight target): without it the robot keeps a goal the
                // backend has given up on. Its traffic grant is released below, so the gate stops it either way.
                if (robot is { IsOnline: true })
                {
                    try
                    {
                        await scope.ServiceProvider.GetRequiredService<IssueCancelCommandHandler>().HandleAsync(
                            command.RobotId, new IssueCancelCommandRequest(command.Id), cancellationToken);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        logger.LogWarning(ex, "CANCEL of command {CommandId} after RESULT timeout not sent", command.Id);
                    }
                }

                if (!command.TryMarkResultTimeout(utcNow))
                {
                    continue;
                }

                robot?.MarkAvailable(utcNow);
                if (command.JobAssignmentId is { } assignmentId)
                {
                    var assignment = await db.JobAssignments.FirstOrDefaultAsync(
                        a => a.Id == assignmentId,
                        cancellationToken);
                    assignment?.TryEnd(AssignmentEndReason.ACK_TIMEOUT, utcNow);
                }

                var traffic = scope.ServiceProvider.GetRequiredService<ITrafficCoordinator>();
                if (command.JobStepId is { } stepId)
                {
                    traffic.ReleaseByJobStep(stepId);
                }
                else
                {
                    traffic.ReleaseGrant(command.RobotId);
                }

                logger.LogWarning(
                    "Command {CommandId} RESULT timeout (acked but no result) for robot {RobotId}",
                    command.Id,
                    command.RobotId);

                await events.PublishAsync(
                    new RobotCommandLifecycleChanged(
                        command.Id,
                        command.RobotId,
                        robot?.Code ?? string.Empty,
                        command.Type.ToString(),
                        command.Status.ToString(),
                        command.JobAssignmentId,
                        command.JobStepId,
                        "FAILED",
                        command.ErrorCode,
                        RobotCommandLifecycleChanged.Phases.Result),
                    cancellationToken);
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>The configured RESULT timeout, or longer when the NAVIGATE carries a longer timeoutSeconds of its own.</summary>
    public static double ResultDeadlineSeconds(string payloadJson, int configuredSeconds)
    {
        var deadline = Math.Max(30, configuredSeconds);
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("timeoutSeconds", out var t)
                && t.ValueKind == JsonValueKind.Number
                && t.GetDouble() is var own)
            {
                return Math.Max(deadline, own + ResultGraceSeconds);
            }
        }
        catch (JsonException)
        {
            // Unreadable payload: the configured timeout still applies.
        }

        return deadline;
    }
}
