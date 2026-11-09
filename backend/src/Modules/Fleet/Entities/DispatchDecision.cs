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

    /// <summary>FLT-01: START / RESUME (what asked for a robot).</summary>
    public string? Trigger { get; set; }

    /// <summary>The operator who chose or overrode; null when the system chose.</summary>
    public Guid? ActorId { get; set; }

    /// <summary>Set when an operator dispatched a robot that was not eligible (battery unknown / stale only).</summary>
    public string? OverrideReason { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
