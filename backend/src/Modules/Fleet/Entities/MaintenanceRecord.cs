namespace WaroTrans.Fleet.Entities;

/// <summary>One maintenance session of a robot (RB-08): who took it out of service, why, and who released it.</summary>
public sealed class MaintenanceRecord
{
    public Guid Id { get; set; }
    public Guid RobotId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public Guid? StartedBy { get; set; }
    public string? StartedByName { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public Guid? CompletedBy { get; set; }
    public string? CompletedByName { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    /// <summary>Return-to-service checklist answers (JSON), only set on completion.</summary>
    public string? ChecklistJson { get; set; }

    public string? Notes { get; set; }
}
