namespace WaroTrans.Fleet.Entities;

/// <summary>
/// A technician's record of work on one robot (phiếu kỹ thuật): a maintenance session, a diagnosis, an inspection, a
/// repair or a technical report. It keeps what was found, what was done (a log of actions), the checklist, the result
/// and the robot's health at the time, so Admins and the next Technician can read the robot's technical story.
/// </summary>
public sealed class TechnicalTicket
{
    public Guid Id { get; set; }

    /// <summary>Human number, <c>TK-YYMMDD-NNN</c> (Vietnam day).</summary>
    public string TicketNo { get; set; } = string.Empty;

    public Guid RobotId { get; set; }
    public string RobotCode { get; set; } = string.Empty;

    /// <summary><see cref="TechnicalTicketTypes"/>.</summary>
    public string Type { get; set; } = TechnicalTicketTypes.Inspection;

    /// <summary><see cref="TechnicalTicketStatuses"/>.</summary>
    public string Status { get; set; } = TechnicalTicketStatuses.Open;

    public string Title { get; set; } = string.Empty;

    /// <summary>Why the ticket was opened: the symptom, the request, the reason for the maintenance.</summary>
    public string? Description { get; set; }

    /// <summary>What the technician found (cause, measurements).</summary>
    public string? Findings { get; set; }

    /// <summary>Actions done, in order: JSON array of { at, byName, text }.</summary>
    public string ActionsJson { get; set; } = "[]";

    /// <summary>Checklist answers: JSON array of { item, ok, note }.</summary>
    public string? ChecklistJson { get; set; }

    /// <summary><see cref="TechnicalTicketResults"/>, set on completion.</summary>
    public string? Result { get; set; }

    /// <summary>The robot's health / status when the ticket was opened (JSON), so the record shows what was seen.</summary>
    public string? SnapshotJson { get; set; }

    public Guid? MaintenanceRecordId { get; set; }
    public Guid? IssueId { get; set; }
    public Guid? JobId { get; set; }

    public Guid? CreatedBy { get; set; }
    public string? CreatedByName { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CompletedBy { get; set; }
    public string? CompletedByName { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

public static class TechnicalTicketTypes
{
    public const string Maintenance = "MAINTENANCE";
    public const string Diagnostic = "DIAGNOSTIC";
    public const string Inspection = "INSPECTION";
    public const string Repair = "REPAIR";
    public const string Report = "TECHNICAL_REPORT";
    public static readonly string[] All = [Maintenance, Diagnostic, Inspection, Repair, Report];
}

public static class TechnicalTicketStatuses
{
    public const string Open = "OPEN";
    public const string Completed = "COMPLETED";
    public const string Cancelled = "CANCELLED";
    public static readonly string[] All = [Open, Completed, Cancelled];
}

public static class TechnicalTicketResults
{
    public const string Passed = "PASSED";
    public const string Fixed = "FIXED";
    public const string NeedsFollowUp = "NEEDS_FOLLOW_UP";
    public const string Failed = "FAILED";
    public static readonly string[] All = [Passed, Fixed, NeedsFollowUp, Failed];
}
