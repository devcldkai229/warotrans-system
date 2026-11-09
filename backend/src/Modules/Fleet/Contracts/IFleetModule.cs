using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Contracts;

/// <summary>
/// Public contract of Fleet for other modules (WorkflowExecution Job engine).
/// Returns snapshots, never Fleet entities.
/// </summary>
public interface IFleetModule
{
    Task<RobotSnapshot?> GetRobotAsync(Guid robotId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The Jobs the robot was assigned to, most recently assigned first, one entry per Job (a Job handed over to
    /// another robot still counts for this one). Empty for an unknown robot.
    /// </summary>
    Task<IReadOnlyList<Guid>> GetRecentJobIdsAsync(Guid robotId, int take, CancellationToken cancellationToken = default);

    /// <summary>BOTH-01: the robot's most recent command, whatever its kind. Null when it has none.</summary>
    Task<RobotCommandSummary?> GetLatestCommandAsync(Guid robotId, CancellationToken cancellationToken = default) =>
        Task.FromResult<RobotCommandSummary?>(null);

    /// <summary>Robots that may take new work on a map (FL-01 eligible, ignoring other Jobs); best first.</summary>
    Task<IReadOnlyList<RobotSnapshot>> GetDispatchCandidatesAsync(
        Guid mapVersionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// FL-01: every robot of the map's warehouse with its eligibility, reasons and score, eligible best-first.
    /// The default treats the plain candidates as eligible (test doubles); Fleet evaluates the full policy.
    /// </summary>
    async Task<IReadOnlyList<DispatchCandidate>> EvaluateDispatchAsync(DispatchQuery query, CancellationToken cancellationToken = default) =>
        (await GetDispatchCandidatesAsync(query.MapVersionId, cancellationToken))
        .Select(r => new DispatchCandidate(
            r.Id, r.Code, !query.BusyRobotIds.Contains(r.Id),
            query.BusyRobotIds.Contains(r.Id) ? [DispatchReasons.Busy] : [],
            r.BatteryPercent, "OK", null, null, 0, r.Status.ToString(), r.IsOnline))
        .ToList();

    /// <summary>FLT-01: stores what dispatch decided and on which candidates. Default: not recorded.</summary>
    Task RecordDispatchDecisionAsync(DispatchDecisionRecord record, CancellationToken cancellationToken = default) => Task.CompletedTask;

    Task<IReadOnlyList<DispatchDecisionView>> GetDispatchDecisionsAsync(Guid jobId, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<DispatchDecisionView>>([]);

    /// <summary>
    /// Sends NAVIGATE_TO_POSE to the robot for one Job step. Progress comes back asynchronously as
    /// <c>RobotCommandLifecycleChanged</c> (ACK / RESULT) carrying <paramref name="jobStepId"/>.
    /// Throws an AppException when the robot cannot take the command (offline, disabled, busy).
    /// Optional <paramref name="route"/> attaches a traffic route grant (graph hash + authorized edge ids).
    /// Optional <paramref name="timeoutSeconds"/> is sent as payload.timeoutSeconds: the robot cancels the
    /// Nav2 goal and reports FAILED once it is exceeded.
    /// </summary>
    Task<Guid> NavigateAsync(
        Guid robotId,
        double x,
        double y,
        double yaw,
        Guid jobId,
        Guid jobStepId,
        CancellationToken cancellationToken = default,
        RouteGrantSnapshot? route = null,
        double? timeoutSeconds = null);

    /// <summary>
    /// Sends CANCEL for an in-flight NAVIGATE. Best effort: returns false (and logs) when the robot is offline
    /// or the command already finished, so a Job cancel is never blocked by it.
    /// </summary>
    Task<bool> CancelNavigationAsync(Guid robotId, Guid navigateCommandId, CancellationToken cancellationToken = default);

    /// <summary>
    /// RB-03 / WFX-03: STOP (or PAUSE) — the robot cancels its goal and holds all motion until RESUME.
    /// Returns the command id, or null when the robot is offline and nothing could be sent (state UNKNOWN).
    /// </summary>
    Task<Guid?> StopRobotAsync(Guid robotId, string mode, string? reason, CancellationToken cancellationToken = default);

    /// <summary>Releases the motion hold. Returns the command id, or null when the robot is offline.</summary>
    Task<Guid?> ResumeRobotAsync(Guid robotId, CancellationToken cancellationToken = default);

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
    double PoseYaw,
    bool MotionHeld = false,
    bool InManualMode = false,
    DateTimeOffset? BatteryMeasuredAt = null);

public sealed record RobotCommandSummary(Guid Id, string Type, string Status, DateTimeOffset IssuedAt, DateTimeOffset? AckedAt, DateTimeOffset? CompletedAt);

/// <summary>Traffic route grant attached to NAVIGATE_TO_POSE (graph hash + authorized edge ids).</summary>
public sealed record RouteGrantSnapshot(string GraphHash, IReadOnlyList<int> EdgeIds);
