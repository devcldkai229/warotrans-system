namespace WaroTrans.Warehouse.Features.CreateProduct;

/// <summary>
/// Admin create for warehouse.products. Sku is unique (trimmed, upper-cased) and so is a non-empty SupplierBarcode,
/// which identifies the product when a supplier package is scanned on receiving. The product starts active.
/// </summary>
public sealed record CreateProductRequest(
    Guid CategoryId,
    string Sku,
    string Name,
    string? SupplierBarcode = null,
    string? Description = null);
