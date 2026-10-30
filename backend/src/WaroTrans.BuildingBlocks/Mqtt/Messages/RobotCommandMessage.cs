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
    public string? RouteId { get; set; }
    public int RouteVersion { get; set; }
    public List<int> SegmentEdgeIds { get; set; } = [];
    public string PathHash { get; set; } = string.Empty;
    public int? GoalSafeStopNodeId { get; set; }
    public Pose2DPayload? FinalGoal { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public Dictionary<string, double>? SpeedLimits { get; set; }
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
    public DateTimeOffset? ExpiresAt { get; set; }
    public Dictionary<string, double>? SpeedLimits { get; set; }

    /// <summary>Set when the extended authority reaches the route destination (robot then finishes NAVIGATE).</summary>
    public Pose2DPayload? FinalGoal { get; set; }
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
