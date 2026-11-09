using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Features.CreateStockVoucher;

/// <summary>
/// Opens a DRAFT phiếu nhập (INBOUND) or phiếu xuất (OUTBOUND). Containers are added afterwards, one line each.
/// ReferenceNo is an outside document number such as the supplier's PO.
/// </summary>
public sealed record CreateStockVoucherRequest(
    Guid WarehouseId,
    StockVoucherType Type,
    string? ReferenceNo = null,
    string? Note = null);
