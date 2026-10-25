using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Services;

/// <summary>
/// Hands a saved RobotCommand to the broker and records the outcome. Single-row ExecuteUpdate statements are used on
/// purpose: telemetry rewrites the robot row several times a second (UpdatedAt is its concurrency token), and an ACK
/// may already have moved the command on, so neither may be saved from stale tracked entities.
/// </summary>
public static class RobotCommandPublishing
{
    public const string PublishFailedErrorCode = "MQTT_PUBLISH_FAILED";

    /// <summary>
    /// Publishes, then stamps PublishedAt (start of the ACK timeout). When the broker cannot be reached the command is
    /// FAILED, the robot released and the job assignment ended, and a <see cref="MqttBrokerUnavailableException"/> is
    /// thrown so the caller (job engine / API) reports it instead of waiting for an ACK that cannot come.
    /// </summary>
    public static async Task PublishAndStampAsync(
        this FleetDbContext db,
        IMqttRobotCommandPublisher publisher,
        RobotCommandMessage message,
        Guid robotId,
        bool releasesRobot,
        CancellationToken cancellationToken)
    {
        try
        {
            await publisher.PublishAsync(message, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            var utcNow = DateTimeOffset.UtcNow;
            await db.RobotCommands
                .Where(c => c.Id == message.CommandId && c.Status == RobotCommandStatus.SENT)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.Status, RobotCommandStatus.FAILED)
                    .SetProperty(c => c.ErrorCode, (string?)PublishFailedErrorCode)
                    .SetProperty(c => c.CompletedAt, (DateTimeOffset?)utcNow), CancellationToken.None);

            if (releasesRobot)
            {
                await db.Robots
                    .Where(r => r.Id == robotId && r.CurrentCommandId == message.CommandId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(r => r.Status, RobotStatus.AVAILABLE)
                        .SetProperty(r => r.CurrentCommandId, (Guid?)null)
                        .SetProperty(r => r.UpdatedAt, utcNow), CancellationToken.None);

                if (message.JobAssignmentId is { } assignmentId)
                {
                    await db.JobAssignments
                        .Where(a => a.Id == assignmentId && a.Status != JobAssignmentStatus.ENDED)
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(a => a.Status, JobAssignmentStatus.ENDED)
                            .SetProperty(a => a.EndedAt, (DateTimeOffset?)utcNow)
                            .SetProperty(a => a.EndReason, (AssignmentEndReason?)AssignmentEndReason.FAILED), CancellationToken.None);
                }
            }

            throw ex as MqttBrokerUnavailableException
                ?? new MqttBrokerUnavailableException($"Robot command could not be sent over MQTT: {ex.Message}");
        }

        var publishedAt = DateTimeOffset.UtcNow;
        await db.RobotCommands
            .Where(c => c.Id == message.CommandId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.PublishedAt, (DateTimeOffset?)publishedAt), cancellationToken);
    }
}
