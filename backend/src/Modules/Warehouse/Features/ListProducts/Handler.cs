using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListProducts;

public sealed class ListProductsHandler(WarehouseDbContext db)
{
    public async Task<ListProductsResponse> HandleAsync(ListProductsRequest request, CancellationToken cancellationToken)
    {
        var query = db.Products.AsNoTracking().AsQueryable();

        if (request.CategoryId is { } categoryId)
        {
            query = query.Where(p => p.CategoryId == categoryId);
        }

        if (request.IsActive is { } isActive)
        {
            query = query.Where(p => p.IsActive == isActive);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var needle = request.Search.Trim().ToLower();
            query = query.Where(p =>
                p.Sku.ToLower().Contains(needle)
                || p.Name.ToLower().Contains(needle)
                || (p.SupplierBarcode != null && p.SupplierBarcode.ToLower().Contains(needle)));
        }

        var total = await query.CountAsync(cancellationToken);
        var products = await query
            .OrderBy(p => p.Sku)
            .Skip(request.Skip)
            .Take(request.Take)
            .ToListAsync(cancellationToken);

        return new ListProductsResponse(products.Select(ProductResponse.From).ToList(), total);
    }
}
