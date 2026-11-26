namespace WaroTrans.WorkflowExecution.Entities;

/// <summary>
/// One change of custody of one container during a payload recovery: from the failed robot to a person or a recovery
/// point, and from there (or straight from the failed robot) to the second robot. The latest record of a container is
/// who holds it now; the list is its history. Recorded only after a person scanned the container.
/// </summary>
public sealed class CargoTransferRecord
{
    public Guid Id { get; set; }
    public Guid RecoveryCaseId { get; set; }
    public Guid JobId { get; set; }
    public Guid ContainerId { get; set; }

    /// <summary><see cref="CustodyTypes"/> and the robot id / account id / endpoint id it names.</summary>
    public string FromCustodyType { get; set; } = CustodyTypes.Robot;
    public Guid? FromCustodyId { get; set; }
    public string ToCustodyType { get; set; } = CustodyTypes.Robot;
    public Guid? ToCustodyId { get; set; }

    public Guid? TransferEndpointId { get; set; }
    public Guid? ConfirmedBy { get; set; }
    public DateTimeOffset ConfirmedAt { get; set; }

    /// <summary>Case, container and step of the transfer: the same confirmation sent twice records once.</summary>
    public string IdempotencyKey { get; set; } = string.Empty;
    public string? Note { get; set; }
}

public static class CustodyTypes
{
    public const string Robot = "ROBOT";
    public const string Staff = "STAFF";
    public const string RecoveryStation = "RECOVERY_STATION";

    /// <summary>Taken off the Job by hand (returned to storage or quarantined): held by Warehouse under a CONTAINER issue.</summary>
    public const string WarehouseHold = "WAREHOUSE_HOLD";
    public static readonly string[] Holders = [Staff, RecoveryStation];
}
