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
}
