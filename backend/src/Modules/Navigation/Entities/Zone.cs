using System.Text.Json;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Entities;

public sealed class Zone
{
    public Guid Id { get; set; }
    public Guid MapVersionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public ZoneType ZoneType { get; set; }
    public JsonDocument Geometry { get; set; } = null!;
    public int Capacity { get; set; }
    public double? MaxSpeed { get; set; }
    public bool IsActive { get; set; }
}
