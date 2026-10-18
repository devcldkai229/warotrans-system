using WaroTrans.Warehouse.Features.Shared;

namespace WaroTrans.Warehouse.Features.ListProductCategories;

public sealed record ListProductCategoriesResponse(IReadOnlyList<ProductCategoryResponse> Items, int Total);
