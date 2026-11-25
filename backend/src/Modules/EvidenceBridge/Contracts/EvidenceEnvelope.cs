using System.Text.Json;

namespace WaroTrans.EvidenceBridge.Contracts;

/// <summary>
/// Wire format v1 of an event sent to the Evidence Recorder (POST /api/evidence/integrations/transport-events).
/// Correlation fields are filled when known; <see cref="Payload"/> is the source event as published (status strings
/// verbatim). The Recorder keeps its own copy of this shape: it never references the monolith.
/// </summary>
public sealed record EvidenceEnvelope(
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
    public const int CurrentSchemaVersion = 1;
    public const string CoreSource = "warotrans-core";

    /// <summary>
    /// Optional (additive, still v1): the source's own ordering when wall clocks cannot order two events, e.g. the
    /// traffic coordinator's decision number. Left out of the JSON when null, so older readers see no change.
    /// </summary>
    public long? Sequence { get; init; }
}

public static class EvidenceEventTypes
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

    /// <summary>A traffic coordinator decision about one robot (grant, refusal, quarantine, deadlock retreat, goal wait).</summary>
    public const string TrafficDecision = "traffic.decision";

    /// <summary>Fault Injection Lab: a deliberate fault started / ended (grading and replay only; never AI evidence).</summary>
    public const string LabFaultInjected = "lab.fault-injected";
    public const string LabFaultCleared = "lab.fault-cleared";

    /// <summary>The backend process started while this trip was unfinished (a restart mid-trip).</summary>
    public const string HostStarted = "host.started";

    /// <summary>Staff scanned another container's label at a handover; the confirmation was refused.</summary>
    public const string HandoverScanRejected = "staff.scan-rejected";
}
