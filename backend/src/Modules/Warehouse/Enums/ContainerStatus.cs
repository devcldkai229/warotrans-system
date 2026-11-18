namespace WaroTrans.Warehouse.Enums;

public enum ContainerStatus
{
    CREATED,
    PACKED,
    RESERVED,
    IN_TRANSIT,
    STORED,
    HOLD,
    EMPTY,
    OUT_OF_SERVICE,

    /// <summary>Left the warehouse on a CONFIRMED outbound StockVoucher; it holds no StorageLocation.</summary>
    ISSUED,

    /// <summary>Delivered to an Outbound gate, still owned by the warehouse until the issue voucher posts.</summary>
    STAGED_OUTBOUND
}
