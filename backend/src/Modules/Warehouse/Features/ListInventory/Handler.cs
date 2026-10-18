using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListInventory;

public sealed class ListInventoryHandler(WarehouseDbContext db)
{
    public async Task<ListInventoryResponse> HandleAsync(ListInventoryRequest request, CancellationToken cancellationToken)
    {
        // A stock row belongs to a Warehouse through its storage location.
        var query = db.InventoryStocks
            .AsNoTracking()
            .Where(s => s.StorageLocation!.WarehouseId == request.WarehouseId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            query = query.Where(s =>
                EF.Functions.ILike(s.Product!.Sku, $"%{term}%")
                || EF.Functions.ILike(s.Product.Name, $"%{term}%")
                || EF.Functions.ILike(s.StorageLocation!.Code, $"%{term}%")
                || EF.Functions.ILike(s.StorageLocation.Name, $"%{term}%"));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(s => s.Product!.Sku)
            .ThenBy(s => s.StorageLocation!.Code)
            .ThenBy(s => s.LevelNo)
            .Skip(request.Skip)
            .Take(request.Take)
            .Select(s => new InventoryStockItemResponse(
                s.Id,
                s.ProductId,
                s.Product!.Sku,
                s.Product.Name,
                s.StorageLocationId,
                s.StorageLocation!.Code,
                s.StorageLocation.Name,
                s.LevelNo,
                s.ContainerCount,
                s.UpdatedAt))
            .ToListAsync(cancellationToken);

        return new ListInventoryResponse(items, total);
    }
}
