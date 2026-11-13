namespace WaroTrans.Warehouse.Features.CreateContainer;

/// <summary>Server-managed receiving roles; endpoint names/codes are not authorization or role metadata.</summary>
public sealed class ReceivingOptions
{
    public const string SectionName = "WarehouseReceiving";
    public Dictionary<string, Guid> InboundStorageLocations { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}
