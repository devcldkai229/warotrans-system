namespace WaroTrans.Warehouse.Features.ListContainers;

public sealed record ListContainersRequest(
    Guid WarehouseId,
    string? Search,
    bool EligibleOnly,
    int Take);
