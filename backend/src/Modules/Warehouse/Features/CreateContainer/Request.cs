namespace WaroTrans.Warehouse.Features.CreateContainer;

/// <param name="StockVoucherId">A DRAFT inbound voucher; the new Container is added to it in the same transaction.</param>
public sealed record CreateContainerRequest(
    Guid ProductId,
    string? SupplierPackageBarcode = null,
    Guid? InitialStorageLocationId = null,
    short? InitialLevelNo = null,
    Guid? StockVoucherId = null
);
