using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.GetProductInventoryContext;

public sealed class GetProductInventoryContextHandler(WarehouseDbContext dbContext)
{
    public async Task<ProductInventoryContextResponse> HandleAsync(
        Guid productId,
        CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == productId, cancellationToken);

        if (product is null)
        {
            throw new NotFoundException($"Product with ID '{productId}' was not found.", "product_not_found");
        }

        var containers = await dbContext.Containers
            .AsNoTracking()
            .Where(c => c.ProductId == productId)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new ContainerSummaryDto(
                c.Id,
                c.Barcode,
                c.Status.ToString(),
                c.CurrentStorageLocationId,
                c.CurrentLevelNo,
                c.CreatedAt))
            .ToListAsync(cancellationToken);

        var totalContainers = containers.Count;
        var containersByStatus = containers
            .GroupBy(c => c.Status)
            .ToDictionary(g => g.Key, g => g.Count());

        var stockBreakdown = await dbContext.InventoryStocks
            .AsNoTracking()
            .Where(s => s.ProductId == productId)
            .OrderBy(s => s.StorageLocation != null ? s.StorageLocation.Code : string.Empty)
            .ThenBy(s => s.LevelNo)
            .Select(s => new LocationStockDto(
                s.StorageLocationId,
                s.StorageLocation != null ? s.StorageLocation.Code : string.Empty,
                s.StorageLocation != null ? s.StorageLocation.Name : string.Empty,
                s.LevelNo,
                s.ContainerCount))
            .ToListAsync(cancellationToken);

        return new ProductInventoryContextResponse(
            product.Id,
            product.Sku,
            product.Name,
            totalContainers,
            containersByStatus,
            stockBreakdown,
            containers.Take(20).ToList());
    }
}
