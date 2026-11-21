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

    /// <summary>
    /// Left the warehouse: a robot delivered it to an Outbound gate for a CONFIRMED outbound StockVoucher, and its
    /// stock was taken off the shelf it came from. It holds no StorageLocation.
    /// </summary>
    ISSUED
}
