using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Entities;

public sealed class MapVersion
{
    public Guid Id { get; set; }
    public Guid WarehouseId { get; set; }
    public int VersionNo { get; set; }
    public string Name { get; set; } = string.Empty;
    public MapStatus Status { get; set; }
    public string MapUri { get; set; } = string.Empty;
    public double Resolution { get; set; }
    public double OriginX { get; set; }
    public double OriginY { get; set; }
    public double OriginYaw { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
}
