namespace WaroTrans.Warehouse.Features.AddStockVoucherLines;

/// <summary>
/// Either name the Containers (<paramref name="ContainerIds"/>), or, on an OUTBOUND voucher only, ask for
/// <paramref name="Count"/> STORED Containers of <paramref name="ProductId"/>, oldest first (FIFO).
/// </summary>
public sealed record AddStockVoucherLinesRequest(
    IReadOnlyList<Guid>? ContainerIds = null,
    Guid? ProductId = null,
    int? Count = null);
