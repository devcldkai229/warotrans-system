using WaroTrans.Warehouse.Features.Shared;

namespace WaroTrans.Warehouse.Features.ListProducts;

public sealed record ListProductsResponse(IReadOnlyList<ProductResponse> Items, int Total);
