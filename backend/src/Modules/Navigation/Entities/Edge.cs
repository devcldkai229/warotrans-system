using System.Text.Json;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Entities;

public sealed class Edge
{
    public Guid Id { get; set; }
    public Guid MapVersionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public JsonDocument Geometry { get; set; } = null!;
    public EdgeDirection Direction { get; set; }
    public int Capacity { get; set; }
    public double? MaxSpeed { get; set; }
    public bool IsActive { get; set; }
}
