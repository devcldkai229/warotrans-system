using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Entities;

public sealed class MapVersion
{
    public Guid Id { get; set; }
    public Guid WarehouseId { get; set; }

    /// <summary>Stable business code, unique per warehouse (e.g. MAP-WH01-V001).</summary>
    public string Code { get; set; } = string.Empty;

    public int VersionNo { get; set; }
    public string Name { get; set; } = string.Empty;
    public MapStatus Status { get; set; }

    /// <summary>Occupancy raster URI (typically map.pgm after import).</summary>
    public string MapUri { get; set; } = string.Empty;

    /// <summary>ROS map.yaml URI.</summary>
    public string? MapYamlUri { get; set; }

    /// <summary>Browser-renderable preview (PNG) URI.</summary>
    public string? PreviewImageUri { get; set; }

    /// <summary>ROS/Nav2 frame id; normally "map".</summary>
    public string FrameId { get; set; } = "map";

    public int ImageWidthPixels { get; set; }
    public int ImageHeightPixels { get; set; }

    public double Resolution { get; set; }
    public double OriginX { get; set; }
    public double OriginY { get; set; }
    public double OriginYaw { get; set; }

    public bool Negate { get; set; }
    public double OccupiedThreshold { get; set; } = 0.65;
    public double FreeThreshold { get; set; } = 0.25;

    public string? ContentHash { get; set; }

    /// <summary>Version this one was cloned from (POST /maps/{id}/clone); null for imported / created maps.</summary>
    public Guid? SourceMapVersionId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
}
