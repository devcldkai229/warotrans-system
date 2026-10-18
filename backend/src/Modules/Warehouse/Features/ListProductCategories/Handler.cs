using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListProductCategories;

public sealed class ListProductCategoriesHandler(WarehouseDbContext db)
{
    // A handful of groups, so there is no paging.
    public async Task<ListProductCategoriesResponse> HandleAsync(CancellationToken cancellationToken)
    {
        var categories = await db.ProductCategories
            .AsNoTracking()
            .OrderBy(c => c.Code)
            .ToListAsync(cancellationToken);

        return new ListProductCategoriesResponse(categories.Select(ProductCategoryResponse.From).ToList(), categories.Count);
    }
}
