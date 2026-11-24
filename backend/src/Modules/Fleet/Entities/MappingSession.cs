using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

/// <summary>
/// Map building from the web: a robot is driven by hand while slam_toolbox builds a new map, which becomes a DRAFT
/// map version when the operator finishes. One open session per robot.
///
/// STARTING  START_MAPPING sent; the robot pauses localization and starts slam_toolbox.
/// MAPPING   the robot is mapping and may be driven by hand (it reports map code MAPPING and is never dispatched).
/// SAVING    STOP_MAPPING (save) sent; the map arrives in chunks and is imported.
/// CANCELLING STOP_MAPPING (no save) sent.
/// COMPLETED / CANCELLED / FAILED: closed. The robot is back on its old map and must be localized again.
/// </summary>
public sealed class MappingSession
{
    public Guid Id { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid RobotId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public MappingSessionStatus Status { get; set; }

    /// <summary>Name the operator gave the map when finishing (the DRAFT map version's name).</summary>
    public string? MapName { get; set; }

    public Guid? StartCommandId { get; set; }
    public Guid? StopCommandId { get; set; }

    public Guid? StartedById { get; set; }
    public string? StartedByName { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? MappingSince { get; set; }
    public DateTimeOffset? StopRequestedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }

    /// <summary>Why it failed, or why the last finish attempt was refused while the session stayed open.</summary>
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }

    public Guid? ResultMapVersionId { get; set; }
    public string? ResultMapVersionCode { get; set; }
    public double? KnownAreaM2 { get; set; }
    public int? MapWidth { get; set; }
    public int? MapHeight { get; set; }

    /// <summary>Where the robot also keeps the map (and its slam_toolbox pose graph), as it reported.</summary>
    public string? RobotPath { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public static readonly MappingSessionStatus[] OpenStatuses =
    [
        MappingSessionStatus.STARTING,
        MappingSessionStatus.MAPPING,
        MappingSessionStatus.SAVING,
        MappingSessionStatus.CANCELLING
    ];

    public bool IsOpen => Status is MappingSessionStatus.STARTING or MappingSessionStatus.MAPPING
        or MappingSessionStatus.SAVING or MappingSessionStatus.CANCELLING;

    public void Fail(string code, string? message, DateTimeOffset now)
    {
        Status = MappingSessionStatus.FAILED;
        ErrorCode = code;
        ErrorMessage = message;
        EndedAt = now;
        UpdatedAt = now;
    }
}
