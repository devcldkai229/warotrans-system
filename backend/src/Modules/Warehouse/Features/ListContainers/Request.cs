namespace WaroTrans.Warehouse.Features.ListContainers;

public sealed record ListContainersRequest(
    Guid WarehouseId,
    string? Search,
    bool EligibleOnly,
    int Take,
    int Skip = 0,
    // Only Containers in this status (a ContainerStatus name); null or empty for every status.
    string? Status = null);
