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
    ISSUED
}
