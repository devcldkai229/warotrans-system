using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;

namespace WaroTrans.Warehouse.Services;

/// <summary>
/// Holds a container while an issue about it is open, and applies the outcome chosen when that issue is resolved.
/// A hold never moves the container: it is held where it is (its shelf, the gate, the inspection point). Every hold and
/// release is a line of the movement ledger, so the container's history says when, why and by which issue.
/// </summary>
public sealed partial class ContainerMovementRecorder : IContainerHolds
{
    public static string HoldKey(Guid issueId, Guid containerId) => $"{issueId:N}:{containerId:N}:HOLD";

    public static string ReleaseKey(Guid issueId, Guid containerId) => $"{issueId:N}:{containerId:N}:RELEASE";

    public async Task<ContainerHoldSnapshot> HoldAsync(ContainerHoldRequest request, CancellationToken cancellationToken = default)
    {
        await WithRetryAsync(() => HoldCoreAsync(request, cancellationToken), cancellationToken);
        return (await GetAsync(request.ContainerId, cancellationToken))!;
    }

    public async Task<ContainerHoldSnapshot> ReleaseAsync(ContainerReleaseRequest request, CancellationToken cancellationToken = default)
    {
        if (!ContainerHoldOutcomes.All.Contains(request.Outcome))
            throw new DomainValidationException("Choose what becomes of the container.", "container_hold_outcome_invalid");
        if (request.Outcome == ContainerHoldOutcomes.AdjustQuantity && request.ContentsQuantity is not > 0)
            throw new DomainValidationException("Enter the counted quantity.", "container_quantity_required");

        await WithRetryAsync(() => ReleaseCoreAsync(request, cancellationToken), cancellationToken);
        return (await GetAsync(request.ContainerId, cancellationToken))!;
    }

    public async Task<ContainerHoldSnapshot?> GetAsync(Guid containerId, CancellationToken cancellationToken = default) =>
        await dbContext.Containers.AsNoTracking()
            .Where(c => c.Id == containerId)
            .Select(c => new ContainerHoldSnapshot(c.Id, c.Barcode, c.Status.ToString(), c.HoldReasonCode, c.HoldIssueId, c.HeldAt,
                c.CurrentStorageLocationId, c.CurrentLevelNo, c.HoldEndpointId, c.ContentsQuantity))
            .SingleOrDefaultAsync(cancellationToken);

    private async Task HoldCoreAsync(ContainerHoldRequest request, CancellationToken ct)
    {
        var key = HoldKey(request.IssueId, request.ContainerId);
        if (await AlreadyRecordedAsync(key, ct)) return;
        var container = await LoadForHoldAsync(request.ContainerId, ct);
        if (await AlreadyRecordedAsync(key, ct)) return;

        if (container.Status is ContainerStatus.ISSUED or ContainerStatus.OUT_OF_SERVICE or ContainerStatus.EMPTY)
        {
            logger.LogWarning("Container {Barcode} is {Status}: not held for issue {IssueId}", container.Barcode, container.Status, request.IssueId);
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var movement = new ContainerMovement
        {
            Id = Guid.NewGuid(),
            ContainerId = container.Id,
            Type = ContainerMovementType.HELD,
            FromStatus = container.Status,
            FromStorageLocationId = container.CurrentStorageLocationId,
            FromLevelNo = container.CurrentLevelNo,
            FromEndpointId = container.HoldEndpointId,
            JobId = request.JobId,
            IdempotencyKey = key,
            ActorAccountId = request.ActorAccountId,
            OccurredAt = now
        };

        container.HoldReasonCode = request.ReasonCode;
        container.HoldIssueId = request.IssueId;
        // "Held once delivered" only means something for a package on a robot: one at rest (on a shelf, at a gate) is
        // never delivered, so it is held at once, or it could still be picked for a new request.
        var heldNow = request.Mode == ContainerHoldMode.NOW || container.Status != ContainerStatus.IN_TRANSIT;
        if (heldNow)
        {
            // On no shelf (set down off the robot here, or a new box still at the Inbound gate): it stands at this point.
            if (container.CurrentStorageLocationId is null && request.AtEndpointId is { } at)
            {
                container.CurrentLevelNo = null;
                container.HoldEndpointId = at;
            }

            // Still on the robot with nowhere said: it stays IN_TRANSIT and is held where it is delivered.
            if (container.Status != ContainerStatus.IN_TRANSIT || request.AtEndpointId is not null)
            {
                container.Status = ContainerStatus.HOLD;
                container.HeldAt = now;
            }
        }

        container.UpdatedAt = now;
        movement.ToStatus = container.Status;
        movement.ToStorageLocationId = container.CurrentStorageLocationId;
        movement.ToLevelNo = container.CurrentLevelNo;
        movement.ToEndpointId = container.HoldEndpointId;
        movement.Note = Trim($"{request.ReasonCode} (issue {request.IssueId:N})"
            + (container.Status == ContainerStatus.HOLD ? string.Empty : ", held once delivered")
            + (string.IsNullOrWhiteSpace(request.Note) ? string.Empty : $": {request.Note.Trim()}"));
        dbContext.ContainerMovements.Add(movement);
        await dbContext.SaveChangesAsync(ct);
        logger.LogInformation("Container {Barcode} held for {Reason} by issue {IssueId}: {Status}",
            container.Barcode, request.ReasonCode, request.IssueId, container.Status);
    }

    private async Task ReleaseCoreAsync(ContainerReleaseRequest request, CancellationToken ct)
    {
        var key = ReleaseKey(request.IssueId, request.ContainerId);
        if (await AlreadyRecordedAsync(key, ct)) return;
        var container = await LoadForHoldAsync(request.ContainerId, ct);
        if (await AlreadyRecordedAsync(key, ct)) return;
        if (container.HoldIssueId != request.IssueId)
        {
            throw new ConflictException(
                $"Container {container.Barcode} is not held by this issue.",
                "container_not_held_by_issue");
        }

        var now = DateTimeOffset.UtcNow;
        var movement = new ContainerMovement
        {
            Id = Guid.NewGuid(),
            ContainerId = container.Id,
            Type = ContainerMovementType.RELEASED,
            FromStatus = container.Status,
            FromStorageLocationId = container.CurrentStorageLocationId,
            FromLevelNo = container.CurrentLevelNo,
            FromEndpointId = container.HoldEndpointId,
            IdempotencyKey = key,
            ActorAccountId = request.ActorAccountId,
            OccurredAt = now
        };
        var reason = container.HoldReasonCode;

        if (ContainerHoldOutcomes.RemovesFromStock(request.Outcome))
        {
            await WriteOffAsync(container, now, ct);
        }
        else
        {
            if (request.Outcome == ContainerHoldOutcomes.AdjustQuantity)
            {
                container.ContentsQuantity = request.ContentsQuantity;
            }

            await ReturnToUseAsync(container, request.IssueId, now, ct);
        }

        container.UpdatedAt = now;
        movement.ToStatus = container.Status;
        movement.ToStorageLocationId = container.CurrentStorageLocationId;
        movement.ToLevelNo = container.CurrentLevelNo;
        movement.ToEndpointId = container.HoldEndpointId;
        movement.Note = Trim($"{request.Outcome} after {reason} (issue {request.IssueId:N})"
            + (request.Outcome == ContainerHoldOutcomes.AdjustQuantity ? $", quantity {request.ContentsQuantity}" : string.Empty)
            + (string.IsNullOrWhiteSpace(request.Note) ? string.Empty : $": {request.Note.Trim()}"));
        dbContext.ContainerMovements.Add(movement);
        await CompleteFinishedVouchersAsync(container, now, ct);
        await dbContext.SaveChangesAsync(ct);
        logger.LogInformation("Container {Barcode} released ({Outcome}) by issue {IssueId}: {Status}",
            container.Barcode, request.Outcome, request.IssueId, container.Status);
    }

    /// <summary>
    /// Back in use where it is: on a shelf it is STORED again; at the gate before it was ever shelved it is what it was
    /// before the hold (a new inbound box waits to be put away again); set down anywhere else it stays HOLD as
    /// OFF_SHELF, for someone to put it on a shelf (Recover). Still on the robot, it simply goes on unflagged.
    /// </summary>
    private async Task ReturnToUseAsync(Container container, Guid issueId, DateTimeOffset now, CancellationToken ct)
    {
        if (container.Status != ContainerStatus.HOLD)
        {
            ClearHold(container);
            return;
        }

        if (container.CurrentStorageLocationId is not null)
        {
            container.Status = ContainerStatus.STORED;
            ClearHold(container);
            return;
        }

        var before = await dbContext.ContainerMovements.AsNoTracking()
            .Where(m => m.IdempotencyKey == HoldKey(issueId, container.Id))
            .Select(m => (ContainerStatus?)m.FromStatus)
            .FirstOrDefaultAsync(ct);
        if (before is { } previous && NeverShelved.Contains(previous))
        {
            container.Status = previous;
            ClearHold(container);
            return;
        }

        var endpoint = container.HoldEndpointId;
        ClearHold(container);
        MarkOffShelf(container, now, endpoint);
    }

    /// <summary>Lost, destroyed or returned: OUT_OF_SERVICE, and off the stock it was counted on.</summary>
    private async Task WriteOffAsync(Container container, DateTimeOffset now, CancellationToken ct)
    {
        if (container.InventoryStorageLocationId is { } slot && container.InventoryLevelNo is { } slotLevel)
        {
            await InventoryAccounting.AdjustAsync(dbContext, container.ProductId, slot, slotLevel, -1, now, ct);
        }
        else if (!HasAdmissionOrBalance(container) && container.CurrentStorageLocationId is { } shelf)
        {
            // Counted on its shelf the old way (no accounting slot).
            await AdjustStockAsync(container, shelf, container.CurrentLevelNo ?? 1, -1, now, ct);
        }

        container.Status = ContainerStatus.OUT_OF_SERVICE;
        container.CurrentStorageLocationId = null;
        container.CurrentLevelNo = null;
        container.InventoryStorageLocationId = null;
        container.InventoryLevelNo = null;
        ClearHold(container);
    }

    private static void ClearHold(Container container)
    {
        container.HoldReasonCode = null;
        container.HoldIssueId = null;
        container.HeldAt = null;
        container.HoldEndpointId = null;
    }

    /// <summary>Set down where no shelf is: HOLD as OFF_SHELF, unless it is already held for a problem.</summary>
    private static void MarkOffShelf(Container container, DateTimeOffset now, Guid? endpointId = null)
    {
        container.HeldAt ??= now;
        container.HoldEndpointId = endpointId ?? container.HoldEndpointId;
        if (!container.HeldForProblem) container.HoldReasonCode = Container.OffShelfHoldReason;
    }

    /// <summary>Delivered to an Outbound gate while held for a problem: never issued, it waits at the gate.</summary>
    private void HoldAtOutboundGate(ContainerDelivery delivery, Container container, DateTimeOffset now)
    {
        container.Status = ContainerStatus.HOLD;
        container.CurrentStorageLocationId = null;
        container.CurrentLevelNo = null;
        container.CurrentEndpointId = null;
        container.HoldEndpointId = delivery.OutboundEndpointId;
        container.HeldAt = now;
        logger.LogWarning("Container {Barcode} held for {Reason} reached an Outbound gate: kept there, not issued",
            container.Barcode, container.HoldReasonCode);
    }

    private async Task<Container> LoadForHoldAsync(Guid containerId, CancellationToken ct)
    {
        var container = (await WarehouseWriteLocks.ContainersAsync(dbContext, [containerId], ct)).SingleOrDefault()
            ?? throw new NotFoundException($"Container '{containerId}' was not found.", "container_not_found");
        await WarehouseWriteLocks.StockAsync(dbContext, [container.ProductId], ct);
        return container;
    }

    private static string Trim(string note) => note.Length > 500 ? note[..500] : note;
}
