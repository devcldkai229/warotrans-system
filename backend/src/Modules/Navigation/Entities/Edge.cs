using System.Text.Json;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Entities;

public sealed class Edge
{
    public Guid Id { get; set; }
    public Guid MapVersionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    /// <summary>GeoJSON LineString in map/world meters (FrameId of MapVersion).</summary>
    public JsonDocument Geometry { get; set; } = null!;

    /// <summary>Corridor width in meters (must be &gt; 0).</summary>
    public double WidthMeters { get; set; } = 1.0;

    public EdgeDirection Direction { get; set; }

    /// <summary>Max speed in meters/second when set.</summary>
    public double? MaxSpeed { get; set; }

    public bool IsActive { get; set; }
}
