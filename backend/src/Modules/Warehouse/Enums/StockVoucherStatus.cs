namespace WaroTrans.Warehouse.Enums;

/// <summary>
/// Set only by people; it never waits for robots. Delivery progress is read from the Containers' status instead.
/// </summary>
public enum StockVoucherStatus
{
    DRAFT,
    CONFIRMED,
    CANCELLED
}
