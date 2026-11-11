namespace WaroTrans.Warehouse.Enums;

public enum ContainerMovementType
{
    PICKED_UP,
    DELIVERED,

    /// <summary>Delivered off-shelf on a CONFIRMED outbound voucher: it left the warehouse.</summary>
    ISSUED,

    /// <summary>A person said where a Container that lost its place really is.</summary>
    RECOVERED
}
