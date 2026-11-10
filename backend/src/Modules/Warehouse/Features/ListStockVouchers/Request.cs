using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Features.ListStockVouchers;

public sealed record ListStockVouchersRequest(
    Guid WarehouseId,
    StockVoucherType? Type,
    StockVoucherStatus? Status,
    string? Search,
    int Skip,
    int Take);
