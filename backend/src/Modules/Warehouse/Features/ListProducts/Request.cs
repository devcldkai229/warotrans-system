namespace WaroTrans.Warehouse.Features.ListProducts;

/// <param name="Search">Matches SKU, name or supplier barcode (case-insensitive, contains).</param>
public sealed record ListProductsRequest(string? Search, Guid? CategoryId, bool? IsActive, int Skip, int Take);
