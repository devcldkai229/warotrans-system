using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Features.CreateStockVoucher;

/// <summary>
/// Opens a phiếu nhập (INBOUND) or phiếu xuất (OUTBOUND). Without <paramref name="ContainerIds"/> it is an empty DRAFT
/// and Containers are added afterwards. With them they are added in the same transaction, and
/// <paramref name="Confirm"/> confirms it as well (born CONFIRMED). ReferenceNo is an outside document number such as
/// the supplier's PO.
/// </summary>
public sealed record CreateStockVoucherRequest(
    Guid WarehouseId,
    StockVoucherType Type,
    string? ReferenceNo = null,
    string? Note = null,
    IReadOnlyList<Guid>? ContainerIds = null,
    bool Confirm = false);
