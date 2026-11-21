namespace WaroTrans.Warehouse.Features.ListStockVouchers;

/// <param name="ContainerCount">Voucher quantity in Containers.</param>
/// <param name="DoneCount">Containers already on a shelf (INBOUND) or issued (OUTBOUND).</param>
/// <param name="ClosedShortCount">Lines dropped when the voucher was closed short.</param>
public sealed record StockVoucherListItemResponse(
    Guid Id,
    string Code,
    string Type,
    string Status,
    string? ReferenceNo,
    string? Note,
    Guid CreatedBy,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ConfirmedAt,
    DateTimeOffset UpdatedAt,
    int ContainerCount,
    int DoneCount,
    DateTimeOffset? CompletedAt = null,
    int ClosedShortCount = 0);

public sealed record ListStockVouchersResponse(
    IReadOnlyList<StockVoucherListItemResponse> Items,
    int Total);
