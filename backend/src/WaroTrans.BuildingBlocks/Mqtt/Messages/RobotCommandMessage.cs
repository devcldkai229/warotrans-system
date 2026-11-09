using System.Text.Json;

namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

public sealed class RobotCommandMessage
{
    public int SchemaVersion { get; set; }
    public Guid MessageId { get; set; }
    public Guid CommandId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public DateTimeOffset IssuedAt { get; set; }
    public Guid? JobAssignmentId { get; set; }
    public Guid? JobStepId { get; set; }
    public JsonElement Payload { get; set; }
}

public static class RobotCommandTypes
{
    public const string NavigateToPose = "NAVIGATE_TO_POSE";
    public const string Cancel = "CANCEL";
    public const string ExtendAuthority = "EXTEND_AUTHORITY";
    public const string RenewAuthority = "RENEW_AUTHORITY";
    public const string RevokeAuthority = "REVOKE_AUTHORITY";
}

public sealed class NavigateToPosePayload
{
    public string FrameId { get; set; } = "map";
    public double X { get; set; }
    public double Y { get; set; }
    public double Yaw { get; set; }

    /// <summary>Optional fleet route grant — robot closes all other graph edges before navigating.</summary>
    public RouteGrantPayload? Route { get; set; }

    /// <summary>Segment motion authority (Active Mode). Optional in Shadow/legacy.</summary>
    public AuthorityPayload? Authority { get; set; }

    /// <summary>Robot cancels the Nav2 goal and reports FAILED after this long. Null = no deadline.</summary>
    public double? TimeoutSeconds { get; set; }
}

/// <summary>Authorized edge set for a NAVIGATE_TO_POSE under traffic coordination.</summary>
public sealed class RouteGrantPayload
{
    public string GraphHash { get; set; } = string.Empty;
    public List<int> EdgeIds { get; set; } = [];
}

/// <summary>Motion authority for a safe-stop segment (ADR 0009 / 0010).</summary>
public sealed class AuthorityPayload
{
    public Guid AuthorityId { get; set; }
    public long Epoch { get; set; }
    public long Seq { get; set; }
    public Guid? MapVersionId { get; set; }
    public string? MapVersionCode { get; set; }
    public string GraphHash { get; set; } = string.Empty;
    /// <summary>Stage-3 semantic map fingerprint (replaces RouteGraph graphHash on semantic path).</summary>
    public string? SemanticMapFingerprint { get; set; }
    /// <summary>Stage-3 Nav2 plan revision authorized by this grant.</summary>
    public long PlanRevision { get; set; }
    /// <summary>Stage-3 reserved resource ids (zone:/cell:).</summary>
    public List<string> ResourceIds { get; set; } = [];
    public string? RouteId { get; set; }
    public int RouteVersion { get; set; }
    public List<int> SegmentEdgeIds { get; set; } = [];
    public string PathHash { get; set; } = string.Empty;
    public int? GoalSafeStopNodeId { get; set; }
    public Pose2DPayload? FinalGoal { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public Dictionary<string, double>? SpeedLimits { get; set; }

    /// <summary>
    /// Ordered executable steps (Forward / Reverse / Spin). Empty or null = legacy Forward-only
    /// over <see cref="SegmentEdgeIds"/> (backward compatible with older robots).
    /// </summary>
    public List<ManeuverStepPayload>? Maneuvers { get; set; }
}

/// <summary>One executable motion step under MotionAuthority (CompilerVersion 10+).</summary>
public sealed class ManeuverStepPayload
{
    /// <summary>Forward | Reverse | Spin.</summary>
    public string Kind { get; set; } = "Forward";

    public List<int> EdgeIds { get; set; } = [];

    /// <summary>Absolute yaw target (rad, map frame) for Spin; unused for Forward/Reverse.</summary>
    public double? YawTarget { get; set; }

    public List<string>? ResourceIds { get; set; }
}

public sealed class Pose2DPayload
{
    public double X { get; set; }
    public double Y { get; set; }
    public double Yaw { get; set; }
}

public sealed class ExtendAuthorityPayload
{
    public Guid TargetCommandId { get; set; }
    public Guid AuthorityId { get; set; }
    public long Epoch { get; set; }
    public long Seq { get; set; }
    public List<int> SegmentEdgeIds { get; set; } = [];
    public string PathHash { get; set; } = string.Empty;
    public string GraphHash { get; set; } = string.Empty;
    public string? SemanticMapFingerprint { get; set; }
    public long PlanRevision { get; set; }
    public List<string> ResourceIds { get; set; } = [];
    public DateTimeOffset? ExpiresAt { get; set; }
    /// <summary>Stage-3: robot plan hash this grant covers (echo of traffic_plan.planHash).</summary>
    public string? PlanHash { get; set; }
    /// <summary>Stage-3: geometry the resources were computed with, so the robot can check it stays inside them.</summary>
    public SemanticGeometryPayload? Geometry { get; set; }
    public Dictionary<string, double>? SpeedLimits { get; set; }

    /// <summary>Set when the extended authority reaches the route destination (robot then finishes NAVIGATE).</summary>
    public Pose2DPayload? FinalGoal { get; set; }

    /// <summary>Steps for the newly granted slice; empty/null = Forward-only over SegmentEdgeIds.</summary>
    public List<ManeuverStepPayload>? Maneuvers { get; set; }
}

public sealed class SemanticGeometryPayload
{
    public double CellSizeMeters { get; set; }
    public double HorizonMeters { get; set; }
    public double SampleStepMeters { get; set; }
    /// <summary>Disc radius reserved around each path sample.</summary>
    public double ReserveRadiusMeters { get; set; }
    /// <summary>Footprint radius (any heading) the robot checks against the reserved cells.</summary>
    public double FootprintRadiusMeters { get; set; }
    /// <summary>Above 0: straight stretches reserve a rectangle this wide per side, and the gate checks the body at its heading.</summary>
    public double LaneHalfWidthMeters { get; set; }
    public double FootprintHalfLengthMeters { get; set; }
    public double FootprintHalfWidthMeters { get; set; }
}

public sealed class RenewAuthorityPayload
{
    public Guid TargetCommandId { get; set; }
    public Guid AuthorityId { get; set; }
    public long Epoch { get; set; }
    public long Seq { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}

public sealed class RevokeAuthorityPayload
{
    public Guid TargetCommandId { get; set; }
    public Guid AuthorityId { get; set; }
    public long Epoch { get; set; }
    public long Seq { get; set; }
    /// <summary>STOP_NOW or STOP_AT_SAFE_STOP.</summary>
    public string Mode { get; set; } = "STOP_NOW";
}

public sealed class CancelCommandPayload
{
    public Guid TargetCommandId { get; set; }
}

/// <summary>Robot → backend traffic progress uplink (QoS1).</summary>
public sealed class TrafficProgressMessage
{
    public int SchemaVersion { get; set; } = 1;
    public Guid MessageId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public string Event { get; set; } = string.Empty;
    public Guid? AuthorityId { get; set; }
    public long Epoch { get; set; }
    public long Seq { get; set; }
    public Guid? BootId { get; set; }
    public long ProgressSeq { get; set; }
    public Guid? CommandId { get; set; }
    public int? EdgeId { get; set; }
    public double? PoseX { get; set; }
    public double? PoseY { get; set; }
    public double? PoseYaw { get; set; }
    public bool LocalizationOk { get; set; }
    public string? FaultCode { get; set; }
    public DateTimeOffset SentAt { get; set; }
    /// <summary>Stage-3: cleared resource ids after physical exit.</summary>
    public List<string>? ClearedResourceIds { get; set; }
}

/// <summary>Robot → backend Nav2 plan proposal for Stage-3 semantic grants.</summary>
public sealed class TrafficPlanProposeMessage
{
    public int SchemaVersion { get; set; } = 1;
    public Guid MessageId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public string SemanticMapFingerprint { get; set; } = string.Empty;
    public long PlanRevision { get; set; }
    public Guid? CommandId { get; set; }
    public Guid? JobStepId { get; set; }
    public Guid? JobId { get; set; }
    /// <summary>Robot-computed hash of <see cref="Poses"/>; the grant echoes it.</summary>
    public string? PlanHash { get; set; }
    public List<Pose2DPayload> Poses { get; set; } = [];
    public Pose2DPayload? Goal { get; set; }
    public DateTimeOffset SentAt { get; set; }
}

/// <summary>Robot → backend authority sync on boot / reconnect.</summary>
public sealed class AuthorityStateMessage
{
    public int SchemaVersion { get; set; } = 1;
    public Guid MessageId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public Guid? BootId { get; set; }
    public Guid? ActiveAuthorityId { get; set; }
    public long LastEpoch { get; set; }
    public long LastSeq { get; set; }
    public string State { get; set; } = "IDLE";
    public Guid? ActiveCommandId { get; set; }
    public List<int> GrantedEdgeIds { get; set; } = [];
    /// <summary>Robot's own map pose when it sent this (right after a reconnect the stored telemetry is stale).</summary>
    public double? PoseX { get; set; }
    public double? PoseY { get; set; }
    public bool? LocalizationOk { get; set; }
    public DateTimeOffset SentAt { get; set; }
}

public static class TrafficProgressEvents
{
    public const string Started = "STARTED";
    public const string EdgeEntered = "EDGE_ENTERED";
    public const string EdgeExited = "EDGE_EXITED";
    public const string SafeStopReached = "SAFE_STOP_REACHED";
    public const string StoppedAwaitingAuthority = "STOPPED_AWAITING_AUTHORITY";
    public const string Fault = "FAULT";
}

public static class AuthorityReasonCodes
{
    public const string AuthorityRequired = "AUTHORITY_REQUIRED";
    public const string AuthorityStaleEpoch = "AUTHORITY_STALE_EPOCH";
    public const string AuthorityStaleSeq = "AUTHORITY_STALE_SEQ";
    public const string AuthorityDuplicate = "AUTHORITY_DUPLICATE";
    public const string AuthorityExpired = "AUTHORITY_EXPIRED";
    public const string MapVersionMismatch = "MAP_VERSION_MISMATCH";
    public const string PathHashMismatch = "PATH_HASH_MISMATCH";
    public const string RouteNotAuthorized = "ROUTE_NOT_AUTHORIZED";
    public const string CorridorViolation = "CORRIDOR_VIOLATION";
    public const string AuthorityLost = "AUTHORITY_LOST";
    public const string LocalizationLost = "LOCALIZATION_LOST";
    public const string ControllerFailed = "CONTROLLER_FAILED";
    public const string SafetyStop = "SAFETY_STOP";
}
