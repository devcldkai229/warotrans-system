namespace WaroTrans.Warehouse.Features.ListContainers;

public sealed record ListContainersRequest(
    Guid WarehouseId,
    string? Search,
    bool EligibleOnly,
    int Take,
    int Skip = 0,
    // Only Containers in this status (a ContainerStatus name); null or empty for every status.
    string? Status = null,
    // Only Containers on a CONFIRMED stock voucher of this type (INBOUND / OUTBOUND) of the warehouse.
    string? VoucherType = null);
