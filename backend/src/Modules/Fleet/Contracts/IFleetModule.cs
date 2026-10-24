using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Contracts;

/// <summary>
/// Public contract of Fleet for other modules (WorkflowExecution Job engine).
/// Returns snapshots, never Fleet entities.
/// </summary>
public interface IFleetModule
{
    Task<RobotSnapshot?> GetRobotAsync(Guid robotId, CancellationToken cancellationToken = default);

    /// <summary>Robots that may take new work on a map: enabled, online, AVAILABLE; best first.</summary>
    Task<IReadOnlyList<RobotSnapshot>> GetDispatchCandidatesAsync(
        Guid mapVersionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends NAVIGATE_TO_POSE to the robot for one Job step. Progress comes back asynchronously as
    /// <c>RobotCommandLifecycleChanged</c> (ACK / RESULT) carrying <paramref name="jobStepId"/>.
    /// Throws an AppException when the robot cannot take the command (offline, disabled, busy).
    /// </summary>
    Task<Guid> NavigateAsync(
        Guid robotId,
        double x,
        double y,
        double yaw,
        Guid jobId,
        Guid jobStepId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Arms the physical HUMAN_INTERACTION confirm button on the robot (MQTT interaction_request).
    /// Not a RobotCommand.
    /// </summary>
    Task RequestHumanInteractionAsync(
        Guid robotId,
        Guid jobId,
        Guid jobStepId,
        string interactionType,
        Guid containerId,
        Guid endpointId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Publishes business acceptance/rejection of an interaction_confirm (MQTT interaction_result).
    /// </summary>
    Task PublishInteractionResultAsync(
        Guid robotId,
        Guid jobStepId,
        Guid confirmMessageId,
        bool accepted,
        string? reasonCode,
        CancellationToken cancellationToken = default);
}

public sealed record RobotSnapshot(
    Guid Id,
    string Code,
    Guid WarehouseId,
    Guid CurrentMapVersionId,
    RobotStatus Status,
    bool IsEnabled,
    bool IsOnline,
    LocalizationStatus? LocalizationStatus,
    NavigationStatus? NavigationStatus,
    decimal? BatteryPercent,
    DateTimeOffset? LastTelemetryAt,
    double PoseX,
    double PoseY,
    double PoseYaw);
