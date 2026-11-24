using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ContainerContents;

public sealed record ContainerContentsItem(Guid ContainerId, decimal Quantity);

public sealed record SetContainerContentsRequest(IReadOnlyList<ContainerContentsItem>? Items);

public sealed record ContainerContentsResult(Guid ContainerId, string Barcode, decimal ContentsQuantity);

/// <summary>
/// How many goods are in each box, corrected before the box is admitted to stock: only a CREATED Container that no
/// CONFIRMED inbound voucher holds (it is still being received). Several boxes at once, all or nothing.
/// </summary>
public sealed class SetContainerContentsHandler(WarehouseDbContext db, IAuditTrail audit, TimeProvider clock)
{
    public const int MaxItems = 200;

    public async Task<IReadOnlyList<ContainerContentsResult>> HandleAsync(SetContainerContentsRequest request, CancellationToken cancellationToken)
    {
        var items = request.Items ?? [];
        if (items.Count == 0 || items.Count > MaxItems)
        {
            throw new DomainValidationException($"Give between 1 and {MaxItems} containers.", "container_contents_items_required");
        }

        if (items.Select(i => i.ContainerId).Distinct().Count() != items.Count)
        {
            throw new DomainValidationException("Each container may appear only once.", "container_contents_duplicate");
        }

        foreach (var item in items)
        {
            if (item.Quantity <= 0 || item.Quantity > CreateContainerValidator.MaxContentsQuantity || decimal.Round(item.Quantity, 3) != item.Quantity)
            {
                throw new DomainValidationException(
                    "Quantity must be positive, at most 999999999999999.999, with at most 3 decimal places.", "container_contents_invalid");
            }
        }

        var ids = items.Select(i => i.ContainerId).ToList();
        var containers = await db.Containers.Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, cancellationToken);
        var missing = ids.FirstOrDefault(id => !containers.ContainsKey(id));
        if (missing != Guid.Empty)
        {
            throw new NotFoundException($"Container '{missing}' was not found.", "container_not_found");
        }

        var confirmed = await db.StockVoucherLines.AsNoTracking()
            .Where(l => ids.Contains(l.ContainerId)
                        && l.StockVoucher.Type == StockVoucherType.INBOUND
                        && l.StockVoucher.Status != StockVoucherStatus.DRAFT
                        && l.StockVoucher.Status != StockVoucherStatus.CANCELLED
                        && l.ClosedShortAt == null)
            .Select(l => new { l.Container!.Barcode, l.StockVoucher.Code })
            .FirstOrDefaultAsync(cancellationToken);
        if (confirmed is not null)
        {
            throw new ConflictException(
                $"Container '{confirmed.Barcode}' is on confirmed voucher {confirmed.Code}; its contents can no longer change.",
                "container_contents_locked");
        }

        foreach (var container in containers.Values)
        {
            if (container.Status != ContainerStatus.CREATED || container.InboundStockVoucherId is not null || container.InventoryStorageLocationId is not null)
            {
                throw new ConflictException(
                    $"Container '{container.Barcode}' is already received ({container.Status}); its contents can no longer change.",
                    "container_contents_locked");
            }
        }

        var now = clock.GetUtcNow();
        var before = containers.Values.ToDictionary(c => c.Id, c => c.ContentsQuantity);
        foreach (var item in items)
        {
            var container = containers[item.ContainerId];
            container.ContentsQuantity = item.Quantity;
            container.UpdatedAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var item in items.Where(i => before[i.ContainerId] != i.Quantity))
        {
            var container = containers[item.ContainerId];
            await audit.RecordAsync(
                new AuditEntry("container.contents_set", "CONTAINER", container.Id,
                    Before: new Dictionary<string, object?> { ["barcode"] = container.Barcode, ["contentsQuantity"] = before[item.ContainerId] },
                    After: new Dictionary<string, object?> { ["barcode"] = container.Barcode, ["contentsQuantity"] = item.Quantity }),
                cancellationToken);
        }

        return items.Select(i => new ContainerContentsResult(i.ContainerId, containers[i.ContainerId].Barcode, i.Quantity)).ToList();
    }
}

public static class ContainerContentsEndpoint
{
    public static RouteGroupBuilder MapContainerContents(this RouteGroupBuilder group)
    {
        group.MapPut("/containers/contents", async (
                SetContainerContentsRequest request, SetContainerContentsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(new { items = await handler.HandleAsync(request, cancellationToken) }))
            .RequirePermission(Permissions.ContainerCreate)
            .WithName("SetContainerContents")
            .WithSummary("Set how many goods are in Containers that are still being received")
            .WithDescription("Only CREATED Containers not held by a confirmed inbound voucher (container_contents_locked otherwise).");

        return group;
    }
}
