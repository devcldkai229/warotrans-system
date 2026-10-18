namespace WaroTrans.Warehouse.Features.CreateProductCategory;

/// <summary>Admin create for warehouse.product_categories. Code is unique (trimmed, upper-cased).</summary>
public sealed record CreateProductCategoryRequest(string Code, string Name, string? Description = null);
