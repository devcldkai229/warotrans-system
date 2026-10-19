namespace WaroTrans.Warehouse.Features.ListInventory;

/// <param name="Search">Matches product SKU or name, or storage location code or name (case-insensitive, contains).</param>
public sealed record ListInventoryRequest(Guid WarehouseId, string? Search, int Skip, int Take);
