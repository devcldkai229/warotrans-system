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

    /// <summary>GeoJSON Polygon in map/world meters (FrameId of MapVersion).</summary>
    public JsonDocument Geometry { get; set; } = null!;

    public int Capacity { get; set; }

    /// <summary>Max speed in meters/second when set.</summary>
    public double? MaxSpeed { get; set; }

    public bool IsActive { get; set; }

    /// <summary>Type-specific policy JSON (schema versioned).</summary>
    public JsonDocument? Policy { get; set; }

    public int PolicySchemaVersion { get; set; } = 1;
}
