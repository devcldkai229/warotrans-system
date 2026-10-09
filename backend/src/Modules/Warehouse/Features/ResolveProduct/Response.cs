namespace WaroTrans.Warehouse.Features.ResolveProduct;

public sealed record ProductDto(
    Guid Id,
    Guid CategoryId,
    string Sku,
    string? SupplierBarcode,
    string Name,
    string? Description,
    bool IsActive
);

public sealed record ResolveProductResponse(
    ProductDto? ExactMatch,
    IReadOnlyList<ProductDto> Items
);
