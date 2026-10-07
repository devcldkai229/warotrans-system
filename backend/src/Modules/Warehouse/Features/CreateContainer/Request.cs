namespace WaroTrans.Warehouse.Features.CreateContainer;

public sealed record CreateContainerRequest(
    Guid ProductId,
    string? SupplierPackageBarcode = null,
    Guid? InitialStorageLocationId = null,
    short? InitialLevelNo = null
);
