using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.AddStockVoucherLines;

public sealed class AddStockVoucherLinesHandler(
    WarehouseDbContext dbContext,
    IContainerTransportLookup transports,
    ICurrentUser currentUser,
    IValidator<AddStockVoucherLinesRequest> validator,
    ILogger<AddStockVoucherLinesHandler> logger,
    IMapEndpointCatalog map)
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
        if (voucher.Status != StockVoucherStatus.DRAFT)
            throw new ConflictException("Only a DRAFT voucher can be changed.", "voucher_not_draft");
        if (request.ContainerIds is not { Count: > 0 } ids)
            throw new DomainValidationException("Select the exact Containers for this voucher.", "voucher_container_ids_required");

        // Replaying a completed add on the same draft does not duplicate lines or select replacement stock.
        var existing = voucher.Lines.Select(l => l.ContainerId).ToHashSet();
        var toAdd = ids.Where(id => !existing.Contains(id)).ToArray();
        if (toAdd.Length == 0)
            return await StockVoucherQueries.LoadDetailAsync(dbContext, voucherId, cancellationToken);

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
            await OutboundStaging.EnsureEligibleAsync(map, voucher.WarehouseId, containers, cancellationToken);
        }
        else
        {
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
        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        logger.LogInformation(
            "{Count} Containers added to stock voucher {Code} by {AccountId}",
            containers.Count,
            voucher.Code,
            currentUser.AccountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }

}
