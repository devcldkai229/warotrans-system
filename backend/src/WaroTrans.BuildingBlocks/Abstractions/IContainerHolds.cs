namespace WaroTrans.BuildingBlocks.Abstractions;

public enum ContainerHoldMode
{
    /// <summary>Taken off its Job: held at once where it is (its shelf, the gate, the inspection point).</summary>
    NOW,

    /// <summary>Reported but still carried: it goes on and is held where it is delivered (never stored or issued).</summary>
    ON_DELIVERY
}

/// <param name="AtEndpointId">Where a container that leaves the robot here is set down (the inspection point, a gate).</param>
public sealed record ContainerHoldRequest(
    Guid ContainerId,
    string ReasonCode,
    Guid IssueId,
    ContainerHoldMode Mode,
    Guid? AtEndpointId = null,
    Guid? JobId = null,
    Guid? ActorAccountId = null,
    string? Note = null);

/// <param name="Outcome">One of <see cref="ContainerHoldOutcomes"/>.</param>
/// <param name="ContentsQuantity">The counted quantity, for <see cref="ContainerHoldOutcomes.AdjustQuantity"/>.</param>
public sealed record ContainerReleaseRequest(
    Guid ContainerId,
    Guid IssueId,
    string Outcome,
    decimal? ContentsQuantity = null,
    Guid? ActorAccountId = null,
    string? Note = null);

/// <param name="HoldReasonCode">A container problem code, OFF_SHELF (set down where no shelf is), or null.</param>
/// <param name="HoldEndpointId">Where a held container stands when it is on no shelf.</param>
public sealed record ContainerHoldSnapshot(
    Guid ContainerId,
    string Barcode,
    string Status,
    string? HoldReasonCode,
    Guid? HoldIssueId,
    DateTimeOffset? HeldAt,
    Guid? StorageLocationId,
    short? LevelNo,
    Guid? HoldEndpointId,
    decimal? ContentsQuantity);

/// <summary>
/// Implemented by Warehouse: holds a container while an issue about it is open, and applies the outcome chosen when it
/// is resolved. Lets WorkflowExecution and Operations do so without referencing Warehouse.
/// </summary>
public interface IContainerHolds
{
    /// <summary>Safe to call twice for the same issue.</summary>
    Task<ContainerHoldSnapshot> HoldAsync(ContainerHoldRequest request, CancellationToken cancellationToken = default);

    /// <summary>Only the issue that holds the container releases it; anything else is refused.</summary>
    Task<ContainerHoldSnapshot> ReleaseAsync(ContainerReleaseRequest request, CancellationToken cancellationToken = default);

    Task<ContainerHoldSnapshot?> GetAsync(Guid containerId, CancellationToken cancellationToken = default);
}
