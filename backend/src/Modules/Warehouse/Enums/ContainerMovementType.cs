namespace WaroTrans.Warehouse.Enums;

public enum ContainerMovementType
{
    PICKED_UP,
    DELIVERED,

    /// <summary>Delivered off-shelf on a CONFIRMED outbound voucher: it left the warehouse.</summary>
    ISSUED,

    /// <summary>A person said where a Container that lost its place really is.</summary>
    RECOVERED,

    /// <summary>Held while an issue about it is open (or flagged to be held once delivered).</summary>
    HELD,

    /// <summary>Its issue was resolved: back in use, its quantity corrected, or written off.</summary>
    RELEASED
}
