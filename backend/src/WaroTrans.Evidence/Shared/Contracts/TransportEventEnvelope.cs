using System.Text.Json;

namespace WaroTrans.Evidence.Contracts;

/// <summary>
/// Wire format v1 of an event pushed by the monolith's EvidenceBridge (its own copy: Evidence never references the
/// monolith). Correlation fields are filled when the source knows them; <see cref="Payload"/> is the source event with
/// status strings verbatim.
/// </summary>
public sealed record TransportEventEnvelope(
    Guid EventId,
    int SchemaVersion,
    string EventType,
    DateTimeOffset OccurredAtUtc,
    string Source,
    Guid? TransportRequestId,
    string? RequestCode,
    Guid? JobId,
    string? JobNo,
    Guid? JobStepId,
    Guid? RobotId,
    string? RobotCode,
    Guid? AssignmentId,
    string? SourceStatusCode,
    JsonElement Payload)
{
    /// <summary>Optional source ordering (e.g. traffic decision number); absent from older producers.</summary>
    public long? Sequence { get; init; }
}

public sealed record TransportEventBatch(IReadOnlyList<TransportEventEnvelope> Events);

public sealed record TransportEventBatchResult(int Accepted, IReadOnlyList<RejectedTransportEvent> Rejected);

public sealed record RejectedTransportEvent(Guid EventId, string Reason);

/// <summary>Event names of envelope v1.</summary>
public static class TransportEventTypes
{
    public const string TransportRequestProgressed = "transport-request.progressed";
    public const string TransportRequestClosed = "transport-request.closed";
    public const string JobStatusChanged = "job.status-changed";
    public const string JobStepStatusChanged = "job.step-status-changed";
    public const string JobContainerStatusChanged = "job.container-status-changed";
    public const string JobRobotAssignmentChanged = "job.robot-assignment-changed";
    public const string RobotCommandLifecycle = "robot.command-lifecycle";
    public const string RobotConnectivityChanged = "robot.connectivity-changed";
    public const string RobotErrorReported = "robot.error-reported";
    public const string RobotBatteryLow = "robot.battery-low";
    public const string RobotGatewayRestarted = "robot.gateway-restarted";
    public const string TrafficWaitChanged = "traffic.wait-changed";
    public const string TrafficDecision = "traffic.decision";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        TransportRequestProgressed, TransportRequestClosed, JobStatusChanged, JobStepStatusChanged,
        JobContainerStatusChanged, JobRobotAssignmentChanged, RobotCommandLifecycle, RobotConnectivityChanged,
        RobotErrorReported, RobotBatteryLow, RobotGatewayRestarted, TrafficWaitChanged, TrafficDecision
    };

    /// <summary>About one robot, not one trip: filed under the robot's run open at that time.</summary>
    public static bool IsRobotScoped(string eventType) =>
        eventType is RobotConnectivityChanged or RobotErrorReported or RobotBatteryLow or RobotGatewayRestarted
            or TrafficWaitChanged or TrafficDecision;
}

/// <summary>What the monolith's reconciliation API (GET /api/evidence-bridge/transport-requests/{id}/runs) returns.</summary>
public sealed record SourceRequestRuns(
    Guid TransportRequestId,
    string? RequestCode,
    string? TransportRequestStatus,
    IReadOnlyList<SourceTripRuns> Trips);

public sealed record SourceTripRuns(
    Guid JobId,
    string JobNo,
    string Status,
    Guid MapVersionId,
    string? MapVersionCode,
    IReadOnlyList<Guid> ContainerIds,
    IReadOnlyList<SourceAssignment> Assignments);

public sealed record SourceAssignment(
    Guid AssignmentId,
    Guid RobotId,
    string? RobotCode,
    string StartReason,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    string? EndReason);
