using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateContainer;

public sealed class CreateContainerHandler(
    WarehouseDbContext dbContext,
    IBusinessCodeGenerator businessCodeGenerator,
    ICurrentUser currentUser,
    IValidator<CreateContainerRequest> validator,
    ILogger<CreateContainerHandler> logger)
{
    public async Task<CreateContainerResponse> HandleAsync(
        CreateContainerRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        if (request.Groups is not null)
            throw new DomainValidationException("Use batch receiving for a grouped request.", "container_request_shape_invalid");

        var product = await dbContext.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.ProductId && p.IsActive, cancellationToken);

        if (product is null)
        {
            throw new NotFoundException($"Product with ID '{request.ProductId}' was not found or is inactive.", "product_not_found");
        }

        StorageLocation? initialLocation = null;
        if (request.InitialStorageLocationId.HasValue)
        {
            initialLocation = await dbContext.StorageLocations
                .AsNoTracking()
                .FirstOrDefaultAsync(l => l.Id == request.InitialStorageLocationId.Value && l.IsActive, cancellationToken)
                ?? throw new NotFoundException($"Storage location with ID '{request.InitialStorageLocationId.Value}' was not found or is inactive.", "storage_location_not_found");
        }

        StockVoucher? voucher = null;
        if (request.StockVoucherId.HasValue)
        {
            voucher = await StockVoucherStore.LoadAsync(dbContext, request.StockVoucherId.Value, cancellationToken);
            if (voucher.Type != StockVoucherType.INBOUND)
            {
                throw new DomainValidationException(
                    $"Voucher {voucher.Code} is not an inbound voucher.",
                    "voucher_not_inbound");
            }
        }

        var barcode = await businessCodeGenerator.NextContainerCodeAsync(cancellationToken: cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var supplierBarcode = string.IsNullOrWhiteSpace(request.SupplierPackageBarcode)
            ? product.SupplierBarcode
            : request.SupplierPackageBarcode.Trim();

        var container = new Container
        {
            Id = Guid.NewGuid(),
            ProductId = product.Id,
            Barcode = barcode,
            SupplierPackageBarcode = supplierBarcode,
            Status = ContainerStatus.CREATED,
            CurrentStorageLocationId = request.InitialStorageLocationId,
            CurrentLevelNo = request.InitialLevelNo,
            CreatedBy = currentUser.AccountId ?? Guid.Empty,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Containers.Add(container);
        if (voucher is not null)
        {
            StockVoucherStore.EnsureSameWarehouse(voucher, container.Barcode, initialLocation?.WarehouseId);
            dbContext.StockVoucherLines.Add(voucher.AddLine(container, now));
            await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);
        }
        else
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        logger.LogInformation(
            "Container {ContainerId} with barcode {Barcode} created for product {ProductId} by {AccountId}",
            container.Id,
            container.Barcode,
            container.ProductId,
            container.CreatedBy);

        return new CreateContainerResponse(
            container.Id,
            container.ProductId,
            container.Barcode,
            container.SupplierPackageBarcode,
            container.Status.ToString(),
            container.CurrentStorageLocationId,
            container.CurrentLevelNo,
            container.CreatedBy,
            container.CreatedAt,
            container.UpdatedAt);
    }
}
