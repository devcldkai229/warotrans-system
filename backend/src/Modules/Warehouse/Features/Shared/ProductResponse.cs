using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Features.Shared;

public sealed record ProductResponse(
    Guid Id,
    Guid CategoryId,
    string Sku,
    string? SupplierBarcode,
    string Name,
    string? Description,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static ProductResponse From(Product product) => new(
        product.Id,
        product.CategoryId,
        product.Sku,
        product.SupplierBarcode,
        product.Name,
        product.Description,
        product.IsActive,
        product.CreatedAt,
        product.UpdatedAt);
}

public sealed record ProductCategoryResponse(Guid Id, string Code, string Name, string? Description)
{
    public static ProductCategoryResponse From(ProductCategory category) =>
        new(category.Id, category.Code, category.Name, category.Description);
}
