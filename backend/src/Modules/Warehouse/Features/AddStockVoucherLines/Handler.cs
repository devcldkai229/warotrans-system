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

        await using var transaction = dbContext.Database.IsRelational() ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        var voucher = await WarehouseWriteLocks.VoucherAsync(dbContext, voucherId, cancellationToken);
        var added = await AddAsync(voucher, request.ContainerIds!, cancellationToken);
        if (added == 0)
            return await StockVoucherQueries.LoadDetailAsync(dbContext, voucherId, cancellationToken);
        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        logger.LogInformation(
            "{Count} Containers added to stock voucher {Code} by {AccountId}",
            added,
            voucher.Code,
            currentUser.AccountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }

    /// <summary>
    /// Adds the named Containers to a DRAFT voucher, locked by the caller, without saving. Inbound takes received
    /// Containers not on another warehouse's shelf; outbound takes Containers on a shelf of the voucher's warehouse
    /// (<see cref="OutboundStock"/>). Replaying the same ids adds nothing.
    /// </summary>
    /// <returns>How many lines were added.</returns>
    internal async Task<int> AddAsync(StockVoucher voucher, IReadOnlyList<Guid> ids, CancellationToken cancellationToken)
    {
        if (voucher.Status != StockVoucherStatus.DRAFT)
            throw new ConflictException("Only a DRAFT voucher can be changed.", "voucher_not_draft");
        if (ids is not { Count: > 0 })
            throw new DomainValidationException("Select the exact Containers for this voucher.", "voucher_container_ids_required");

        // Replaying a completed add on the same draft does not duplicate lines or select replacement stock.
        var existing = voucher.Lines.Select(l => l.ContainerId).ToHashSet();
        var toAdd = ids.Where(id => !existing.Contains(id)).Distinct().ToArray();
        if (toAdd.Length == 0)
            return 0;

        var locked = await WarehouseWriteLocks.ContainersAsync(dbContext, toAdd, cancellationToken);
        var byId = locked.ToDictionary(c => c.Id);
        var missing = toAdd.FirstOrDefault(id => !byId.ContainsKey(id));
        if (missing != Guid.Empty)
            throw new NotFoundException($"Container '{missing}' was not found.", "container_not_found");
        var containers = toAdd.Select(id => byId[id]).ToList();

        await StockVoucherStore.EnsureNotOnOtherVoucherAsync(dbContext, voucher, toAdd, cancellationToken);
        await StockVoucherStore.EnsureNotInTransportAsync(transports, containers, cancellationToken);
        if (voucher.Type == StockVoucherType.OUTBOUND)
        {
            await OutboundStock.EnsureEligibleAsync(dbContext, voucher.WarehouseId, containers, cancellationToken);
        }
        else
        {
            var empty = containers.FirstOrDefault(c => c.ContentsQuantity is null or <= 0);
            if (empty is not null)
                throw new DomainValidationException(
                    $"Container '{empty.Barcode}' does not say how many goods it holds.", "container_contents_incomplete");

            var locationIds = containers.Select(c => c.CurrentStorageLocationId).OfType<Guid>().Distinct().ToArray();
            var locations = await dbContext.StorageLocations.AsNoTracking()
                .Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.WarehouseId, cancellationToken);
            foreach (var container in containers)
            {
                var owner = container.WarehouseId;
                if (owner is null && container.CurrentStorageLocationId is { } locationId
                    && locations.TryGetValue(locationId, out var locationOwner))
                    owner = locationOwner;
                StockVoucherStore.EnsureSameWarehouse(voucher, container.Barcode, owner);
            }
        }

        dbContext.StockVoucherLines.AddRange(voucher.AddLines(containers, DateTimeOffset.UtcNow));
        return containers.Count;
    }
}
