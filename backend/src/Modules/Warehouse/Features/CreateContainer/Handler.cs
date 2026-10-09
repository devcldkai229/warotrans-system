using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
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

        var product = await dbContext.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.ProductId && p.IsActive, cancellationToken);

        if (product is null)
        {
            throw new NotFoundException($"Product with ID '{request.ProductId}' was not found or is inactive.", "product_not_found");
        }

        if (request.InitialStorageLocationId.HasValue)
        {
            var locationExists = await dbContext.StorageLocations
                .AnyAsync(l => l.Id == request.InitialStorageLocationId.Value && l.IsActive, cancellationToken);

            if (!locationExists)
            {
                throw new NotFoundException($"Storage location with ID '{request.InitialStorageLocationId.Value}' was not found or is inactive.", "storage_location_not_found");
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
        await dbContext.SaveChangesAsync(cancellationToken);

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
