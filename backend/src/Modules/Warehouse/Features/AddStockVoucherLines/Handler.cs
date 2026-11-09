using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.AddStockVoucherLines;

public sealed class AddStockVoucherLinesHandler(
    WarehouseDbContext dbContext,
    IContainerTransportLookup transports,
    ICurrentUser currentUser,
    IValidator<AddStockVoucherLinesRequest> validator,
    ILogger<AddStockVoucherLinesHandler> logger)
{
    public async Task<StockVoucherDetailResponse> HandleAsync(
        Guid voucherId,
        AddStockVoucherLinesRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var voucher = await StockVoucherStore.LoadAsync(dbContext, voucherId, cancellationToken);
        var containers = request.ContainerIds is { Count: > 0 } ids
            ? await LoadNamedAsync(ids, cancellationToken)
            : await PickOldestStoredAsync(voucher, request.ProductId!.Value, request.Count!.Value, cancellationToken);

        await StockVoucherStore.EnsureNotOnOtherVoucherAsync(
            dbContext,
            voucher,
            containers.Select(c => c.Id).ToList(),
            cancellationToken);
        await StockVoucherStore.EnsureNotInTransportAsync(transports, containers, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        foreach (var container in containers)
        {
            StockVoucherStore.EnsureSameWarehouse(voucher, container.Barcode, container.CurrentStorageLocation?.WarehouseId);
            // Added explicitly: a new line with a preset key would otherwise be tracked as an existing row.
            dbContext.StockVoucherLines.Add(voucher.AddLine(container, now));
        }

        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);

        logger.LogInformation(
            "{Count} Containers added to stock voucher {Code} by {AccountId}",
            containers.Count,
            voucher.Code,
            currentUser.AccountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }

    private async Task<IReadOnlyList<Container>> LoadNamedAsync(IReadOnlyList<Guid> ids, CancellationToken cancellationToken)
    {
        var found = await dbContext.Containers
            .AsNoTracking()
            .Include(c => c.CurrentStorageLocation)
            .Where(c => ids.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        var missing = ids.FirstOrDefault(id => !found.ContainsKey(id));
        if (missing != Guid.Empty)
        {
            throw new NotFoundException($"Container '{missing}' was not found.", "container_not_found");
        }

        return ids.Select(id => found[id]).ToList();
    }

    private async Task<IReadOnlyList<Container>> PickOldestStoredAsync(
        StockVoucher voucher,
        Guid productId,
        int count,
        CancellationToken cancellationToken)
    {
        if (voucher.Type != StockVoucherType.OUTBOUND)
        {
            throw new DomainValidationException(
                "Picking by product is only for an outbound voucher; scan the Containers of an inbound voucher.",
                "voucher_pick_outbound_only");
        }

        var onThisVoucher = voucher.Lines.Select(l => l.ContainerId).ToList();
        var free = await dbContext.Containers
            .AsNoTracking()
            .Include(c => c.CurrentStorageLocation)
            .Where(c => c.ProductId == productId
                && c.Status == ContainerStatus.STORED
                && c.CurrentStorageLocation != null
                && c.CurrentStorageLocation.WarehouseId == voucher.WarehouseId
                && !onThisVoucher.Contains(c.Id)
                && !dbContext.StockVoucherLines.Any(l => l.ContainerId == c.Id
                    && l.StockVoucher.Type == StockVoucherType.OUTBOUND
                    && l.StockVoucher.Status != StockVoucherStatus.CANCELLED))
            .OrderBy(c => c.CreatedAt)
            .ThenBy(c => c.Barcode)
            .ToListAsync(cancellationToken);

        // Containers robots are already moving live in Transportation's tables, so they are skipped after the query.
        var moving = await transports.GetContainersInActiveTransportAsync(free.Select(c => c.Id).ToList(), cancellationToken);
        var picked = free.Where(c => !moving.Contains(c.Id)).Take(count).ToList();

        if (picked.Count < count)
        {
            throw new DomainValidationException(
                $"Only {picked.Count} stored Container(s) of this product are free in the warehouse; {count} requested.",
                "not_enough_stored_containers");
        }

        return picked;
    }
}
