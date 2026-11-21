namespace WaroTrans.Warehouse.Enums;

/// <summary>
/// DRAFT → CONFIRMED (by people) → COMPLETED (the last open line got done: on a shelf for inbound, issued at the
/// Outbound gate for outbound) or, by people again, CANCELLED / closed short (COMPLETED with fewer lines done).
/// Stock is never posted by a status change: it follows each Container as robots deliver it.
/// </summary>
public enum StockVoucherStatus
{
    DRAFT,
    CONFIRMED,
    CANCELLED,
    COMPLETED
}
