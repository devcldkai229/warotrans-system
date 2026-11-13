namespace WaroTrans.Warehouse.Features.ListContainers;

/// <param name="InActiveTransport">On an open Transport Request, so it cannot go on a stock voucher right now.</param>
public sealed record ContainerListItemResponse(
    Guid Id,
    string Barcode,
    string Status,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    Guid? CurrentStorageLocationId,
    string? CurrentStorageLocationCode,
    Guid? CurrentEndpointId,
    short? CurrentLevelNo,
    string? SupplierPackageBarcode,
    DateTimeOffset UpdatedAt,
    bool InActiveTransport = false,
    ContainerVoucherResponse? Voucher = null);

/// <summary>The latest stock voucher (not cancelled) the Container is on: a request composer offers it first.</summary>
public sealed record ContainerVoucherResponse(
    Guid Id,
    string Code,
    string Type,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ConfirmedAt);

public sealed record ListContainersResponse(
    IReadOnlyList<ContainerListItemResponse> Items,
    int Total);
