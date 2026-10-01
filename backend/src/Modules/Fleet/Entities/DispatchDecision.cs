using System.Text.Json;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

public sealed class DispatchDecision
{
    public Guid Id { get; set; }
    public Guid JobId { get; set; }
    public Guid? RobotId { get; set; }
    public DispatchDecisionType Type { get; set; }
    public JsonDocument CandidateEvaluations { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
}
