using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.GetContainer;

public sealed class GetContainerHandler(WarehouseDbContext dbContext)
{
    public async Task<ContainerDetailsResponse> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var result = await dbContext.Containers
            .AsNoTracking()
            .Where(c => c.Id == id)
            .Select(c => new ContainerDetailsResponse(
                c.Id,
                c.ProductId,
                c.Product != null ? c.Product.Sku : string.Empty,
                c.Product != null ? c.Product.Name : string.Empty,
                c.Barcode,
                c.SupplierPackageBarcode,
                c.Status.ToString(),
                c.CurrentStorageLocationId,
                c.CurrentStorageLocation != null ? c.CurrentStorageLocation.Code : null,
                c.CurrentStorageLocation != null ? c.CurrentStorageLocation.Name : null,
                c.CurrentLevelNo,
                c.CreatedBy,
                c.CreatedAt,
                c.UpdatedAt))
            .FirstOrDefaultAsync(cancellationToken);

        if (result is null)
        {
            throw new NotFoundException($"Container with ID '{id}' was not found.", "container_not_found");
        }

        return result;
    }

    public async Task<ContainerDetailsResponse> GetByBarcodeAsync(string barcode, CancellationToken cancellationToken = default)
    {
        var trimmed = barcode.Trim();
        var result = await dbContext.Containers
            .AsNoTracking()
            .Where(c => c.Barcode == trimmed)
            .Select(c => new ContainerDetailsResponse(
                c.Id,
                c.ProductId,
                c.Product != null ? c.Product.Sku : string.Empty,
                c.Product != null ? c.Product.Name : string.Empty,
                c.Barcode,
                c.SupplierPackageBarcode,
                c.Status.ToString(),
                c.CurrentStorageLocationId,
                c.CurrentStorageLocation != null ? c.CurrentStorageLocation.Code : null,
                c.CurrentStorageLocation != null ? c.CurrentStorageLocation.Name : null,
                c.CurrentLevelNo,
                c.CreatedBy,
                c.CreatedAt,
                c.UpdatedAt))
            .FirstOrDefaultAsync(cancellationToken);

        if (result is null)
        {
            throw new NotFoundException($"Container with barcode '{trimmed}' was not found.", "container_not_found");
        }

        return result;
    }
}
