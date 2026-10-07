namespace WaroTrans.Warehouse.Features.ResolveProduct;

public sealed record ResolveProductRequest(
    string? Barcode = null,
    string? Query = null,
    int Limit = 20
);
