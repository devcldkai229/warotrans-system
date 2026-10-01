using System.Text.Json;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

public sealed class RobotStateEvent
{
    public Guid Id { get; set; }
    public Guid RobotId { get; set; }
    public Guid? JobId { get; set; }
    public RobotStatus? FromStatus { get; set; }
    public RobotStatus ToStatus { get; set; }
    public string? Reason { get; set; }
    public RobotStateEventSource Source { get; set; }
    public JsonDocument? Details { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
}
