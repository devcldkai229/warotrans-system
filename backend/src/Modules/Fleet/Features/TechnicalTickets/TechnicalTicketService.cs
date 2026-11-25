using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Features.RobotHealth;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.TechnicalTickets;

public sealed record TicketAction(DateTimeOffset At, string? ByName, string Text);

public sealed record TicketChecklistItem(string Item, bool Ok, string? Note = null);

public sealed record CreateTicketRequest(
    string Type,
    string Title,
    string? Description = null,
    string? Findings = null,
    Guid? IssueId = null,
    Guid? JobId = null);

public sealed record UpdateTicketRequest(
    string? Title = null,
    string? Description = null,
    string? Findings = null,
    IReadOnlyList<TicketChecklistItem>? Checklist = null);

public sealed record AddTicketActionRequest(string Text);

public sealed record CompleteTicketRequest(string Result, string? Findings = null, IReadOnlyList<TicketChecklistItem>? Checklist = null);

public sealed record CancelTicketRequest(string Reason);

public sealed record TechnicalTicketResponse(
    Guid Id,
    string TicketNo,
    Guid RobotId,
    string RobotCode,
    string Type,
    string Status,
    string Title,
    string? Description,
    string? Findings,
    IReadOnlyList<TicketAction> Actions,
    IReadOnlyList<TicketChecklistItem> Checklist,
    string? Result,
    JsonElement? Snapshot,
    Guid? MaintenanceRecordId,
    Guid? IssueId,
    Guid? JobId,
    string? CreatedByName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? CompletedByName,
    DateTimeOffset? CompletedAt);

public sealed record TechnicalTicketQuery(
    Guid? RobotId = null,
    string? Type = null,
    string? Status = null,
    string? Search = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    int Skip = 0,
    int Take = 50);

/// <summary>
/// Technical tickets (phiếu kỹ thuật): Technicians open them on a robot, log what they did, fill a checklist and close
/// them with a result; Admins read them all. A maintenance session opens and closes its own MAINTENANCE ticket.
/// </summary>
public sealed class TechnicalTicketService(
    FleetDbContext db,
    ICurrentUser currentUser,
    IRobotAccessScope robotScope,
    IAuditTrail audit,
    TimeProvider clock,
    RobotHealthStore? health = null)
{
    public const int MaxTake = 200;

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly TimeZoneInfo Vietnam = FindVietnam();

    public async Task<(IReadOnlyList<TechnicalTicketResponse> Items, int Total)> ListAsync(
        TechnicalTicketQuery query, CancellationToken cancellationToken)
    {
        var scope = await robotScope.GetCurrentAsync(cancellationToken);
        var tickets = db.TechnicalTickets.AsNoTracking().AsQueryable();
        if (!scope.AllRobots)
        {
            var allowed = scope.RobotIds.ToList();
            tickets = tickets.Where(t => allowed.Contains(t.RobotId));
        }

        if (query.RobotId is { } robotId) tickets = tickets.Where(t => t.RobotId == robotId);
        if (Normalize(query.Type, TechnicalTicketTypes.All, "ticket_type_invalid") is { } type) tickets = tickets.Where(t => t.Type == type);
        if (Normalize(query.Status, TechnicalTicketStatuses.All, "ticket_status_invalid") is { } status) tickets = tickets.Where(t => t.Status == status);
        if (query.From is { } from) tickets = tickets.Where(t => t.CreatedAt >= from);
        if (query.To is { } to) tickets = tickets.Where(t => t.CreatedAt <= to);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = $"%{query.Search.Trim()}%";
            tickets = tickets.Where(t => EF.Functions.ILike(t.TicketNo, term) || EF.Functions.ILike(t.Title, term)
                || EF.Functions.ILike(t.RobotCode, term) || (t.Findings != null && EF.Functions.ILike(t.Findings, term)));
        }

        var total = await tickets.CountAsync(cancellationToken);
        var rows = await tickets.OrderByDescending(t => t.CreatedAt)
            .Skip(Math.Max(0, query.Skip))
            .Take(Math.Clamp(query.Take, 1, MaxTake))
            .ToListAsync(cancellationToken);
        return (rows.Select(ToResponse).ToList(), total);
    }

    public async Task<TechnicalTicketResponse> GetAsync(Guid ticketId, CancellationToken cancellationToken) =>
        ToResponse(await LoadVisibleAsync(ticketId, tracked: false, cancellationToken));

    public async Task<TechnicalTicketResponse> CreateAsync(Guid robotId, CreateTicketRequest request, CancellationToken cancellationToken)
    {
        var type = Normalize(request.Type, TechnicalTicketTypes.All, "ticket_type_invalid")
            ?? throw new DomainValidationException("Choose the kind of ticket.", "ticket_type_required");
        var title = Clean(request.Title, 200) ?? throw new DomainValidationException("Give the ticket a title.", "ticket_title_required");
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
        var ticket = await NewTicketAsync(robot, type, title, Clean(request.Description, 4000), cancellationToken);
        ticket.Findings = Clean(request.Findings, 4000);
        ticket.IssueId = request.IssueId;
        ticket.JobId = request.JobId;
        db.TechnicalTickets.Add(ticket);
        await db.SaveChangesAsync(cancellationToken);
        await AuditAsync("ticket.created", ticket, null, cancellationToken);
        return ToResponse(ticket);
    }

    public async Task<TechnicalTicketResponse> UpdateAsync(Guid ticketId, UpdateTicketRequest request, CancellationToken cancellationToken)
    {
        var ticket = await LoadVisibleAsync(ticketId, tracked: true, cancellationToken);
        EnsureOpen(ticket);
        if (request.Title is not null)
        {
            ticket.Title = Clean(request.Title, 200) ?? throw new DomainValidationException("Give the ticket a title.", "ticket_title_required");
        }

        if (request.Description is not null) ticket.Description = Clean(request.Description, 4000);
        if (request.Findings is not null) ticket.Findings = Clean(request.Findings, 4000);
        if (request.Checklist is not null) ticket.ChecklistJson = SerializeChecklist(request.Checklist);
        ticket.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return ToResponse(ticket);
    }

    public async Task<TechnicalTicketResponse> AddActionAsync(Guid ticketId, AddTicketActionRequest request, CancellationToken cancellationToken)
    {
        var ticket = await LoadVisibleAsync(ticketId, tracked: true, cancellationToken);
        EnsureOpen(ticket);
        var text = Clean(request.Text, 1000) ?? throw new DomainValidationException("Say what was done.", "ticket_action_required");
        var actions = Actions(ticket).ToList();
        if (actions.Count >= 200) throw new DomainValidationException("A ticket keeps at most 200 actions.", "ticket_actions_full");
        actions.Add(new TicketAction(clock.GetUtcNow(), currentUser.Username, text));
        ticket.ActionsJson = JsonSerializer.Serialize(actions, JsonOptions);
        ticket.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return ToResponse(ticket);
    }

    public async Task<TechnicalTicketResponse> CompleteAsync(Guid ticketId, CompleteTicketRequest request, CancellationToken cancellationToken)
    {
        var ticket = await LoadVisibleAsync(ticketId, tracked: true, cancellationToken);
        EnsureOpen(ticket);
        if (ticket.Type == TechnicalTicketTypes.Maintenance && ticket.MaintenanceRecordId is not null)
        {
            throw new ConflictException(
                "This ticket belongs to a maintenance session: it closes when the robot returns to service.", "ticket_closed_by_maintenance");
        }

        Close(ticket, request);
        await db.SaveChangesAsync(cancellationToken);
        await AuditAsync("ticket.completed", ticket, ticket.Result, cancellationToken);
        return ToResponse(ticket);
    }

    public async Task<TechnicalTicketResponse> CancelAsync(Guid ticketId, CancelTicketRequest request, CancellationToken cancellationToken)
    {
        var ticket = await LoadVisibleAsync(ticketId, tracked: true, cancellationToken);
        EnsureOpen(ticket);
        if (ticket.MaintenanceRecordId is not null)
        {
            throw new ConflictException(
                "This ticket belongs to a maintenance session: it closes when the robot returns to service.", "ticket_closed_by_maintenance");
        }

        var reason = Clean(request.Reason, 500) ?? throw new DomainValidationException("Say why the ticket is cancelled.", "ticket_cancel_reason_required");
        var now = clock.GetUtcNow();
        var actions = Actions(ticket).Append(new TicketAction(now, currentUser.Username, $"Cancelled: {reason}")).ToList();
        ticket.ActionsJson = JsonSerializer.Serialize(actions, JsonOptions);
        ticket.Status = TechnicalTicketStatuses.Cancelled;
        ticket.CompletedAt = now;
        ticket.CompletedBy = currentUser.AccountId;
        ticket.CompletedByName = currentUser.Username;
        ticket.UpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        await AuditAsync("ticket.cancelled", ticket, reason, cancellationToken);
        return ToResponse(ticket);
    }

    // ------------------------------------------------------------------ maintenance sessions (RobotControlService)

    /// <summary>A maintenance session starts: its MAINTENANCE ticket is added to the same unit of work (not saved here).</summary>
    public async Task<TechnicalTicket> OpenForMaintenanceAsync(Robot robot, MaintenanceRecord record, CancellationToken cancellationToken)
    {
        var ticket = await NewTicketAsync(robot, TechnicalTicketTypes.Maintenance, $"Maintenance of {robot.Code}", record.Reason, cancellationToken);
        ticket.MaintenanceRecordId = record.Id;
        db.TechnicalTickets.Add(ticket);
        return ticket;
    }

    /// <summary>The robot returns to service: its open maintenance ticket closes with the checklist (not saved here).</summary>
    public async Task CloseForMaintenanceAsync(Robot robot, MaintenanceRecord record, IReadOnlyList<TicketChecklistItem> checklist,
        string? notes, CancellationToken cancellationToken)
    {
        var ticket = await db.TechnicalTickets
            .Where(t => t.RobotId == robot.Id && t.Status == TechnicalTicketStatuses.Open && t.Type == TechnicalTicketTypes.Maintenance
                && (t.MaintenanceRecordId == record.Id || t.MaintenanceRecordId == null))
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (ticket is null)
        {
            ticket = await NewTicketAsync(robot, TechnicalTicketTypes.Maintenance, $"Maintenance of {robot.Code}", record.Reason, cancellationToken);
            ticket.MaintenanceRecordId = record.Id;
            ticket.CreatedAt = record.StartedAt;
            db.TechnicalTickets.Add(ticket);
        }

        Close(ticket, new CompleteTicketRequest(TechnicalTicketResults.Passed, Findings: notes is null ? null : AppendFindings(ticket.Findings, notes), checklist));
    }

    // ------------------------------------------------------------------ helpers

    private void Close(TechnicalTicket ticket, CompleteTicketRequest request)
    {
        var result = Normalize(request.Result, TechnicalTicketResults.All, "ticket_result_invalid")
            ?? throw new DomainValidationException("Give the result of the work.", "ticket_result_required");
        var now = clock.GetUtcNow();
        if (request.Findings is not null) ticket.Findings = Clean(request.Findings, 4000);
        if (request.Checklist is not null) ticket.ChecklistJson = SerializeChecklist(request.Checklist);
        ticket.Result = result;
        ticket.Status = TechnicalTicketStatuses.Completed;
        ticket.CompletedAt = now;
        ticket.CompletedBy = currentUser.AccountId;
        ticket.CompletedByName = currentUser.Username;
        ticket.UpdatedAt = now;
    }

    private async Task<TechnicalTicket> NewTicketAsync(Robot robot, string type, string title, string? description, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        return new TechnicalTicket
        {
            Id = Guid.NewGuid(),
            TicketNo = await NextNumberAsync(now, cancellationToken),
            RobotId = robot.Id,
            RobotCode = robot.Code,
            Type = type,
            Status = TechnicalTicketStatuses.Open,
            Title = title,
            Description = description,
            SnapshotJson = Snapshot(robot, now),
            CreatedBy = currentUser.AccountId,
            CreatedByName = currentUser.Username,
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    /// <summary>TK-YYMMDD-NNN, numbered per Vietnam day. Unique index: a clash (two at once) fails the save, never duplicates.</summary>
    private async Task<string> NextNumberAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var day = TimeZoneInfo.ConvertTime(now, Vietnam).ToString("yyMMdd", CultureInfo.InvariantCulture);
        var prefix = $"TK-{day}-";
        var pending = db.ChangeTracker.Entries<TechnicalTicket>().Count(e => e.State == EntityState.Added && e.Entity.TicketNo.StartsWith(prefix));
        var last = await db.TechnicalTickets.AsNoTracking()
            .Where(t => t.TicketNo.StartsWith(prefix))
            .OrderByDescending(t => t.TicketNo)
            .Select(t => t.TicketNo)
            .FirstOrDefaultAsync(cancellationToken);
        var next = (last is not null && int.TryParse(last[prefix.Length..], out var n) ? n : 0) + 1 + pending;
        return $"{prefix}{next:000}";
    }

    private string Snapshot(Robot robot, DateTimeOffset now)
    {
        object? healthView = null;
        if (health is not null)
        {
            try
            {
                healthView = health.Get(robot.Id, robot.Code);
            }
            catch (Exception)
            {
                healthView = null;
            }
        }

        return JsonSerializer.Serialize(new
        {
            takenAt = now,
            status = robot.Status.ToString(),
            isOnline = robot.IsOnline,
            motionHeld = robot.MotionHeld,
            batteryPercent = robot.BatteryPercent,
            localizationStatus = robot.LocalizationStatus?.ToString(),
            navigationStatus = robot.NavigationStatus?.ToString(),
            pose = new { x = robot.PoseX, y = robot.PoseY, yaw = robot.PoseYaw },
            lastTelemetryAt = robot.LastTelemetryAt,
            lastErrorCode = robot.ErrorCode,
            health = healthView
        }, JsonOptions);
    }

    private async Task<TechnicalTicket> LoadVisibleAsync(Guid ticketId, bool tracked, CancellationToken cancellationToken)
    {
        var source = tracked ? db.TechnicalTickets : db.TechnicalTickets.AsNoTracking();
        var ticket = await source.FirstOrDefaultAsync(t => t.Id == ticketId, cancellationToken)
            ?? throw new NotFoundException($"Ticket '{ticketId}' was not found.", "ticket_not_found");
        var scope = await robotScope.GetCurrentAsync(cancellationToken);
        if (!scope.Allows(ticket.RobotId))
        {
            // Not "forbidden": a Technician must not learn that a ticket of another robot exists.
            throw new NotFoundException($"Ticket '{ticketId}' was not found.", "ticket_not_found");
        }

        return ticket;
    }

    private static void EnsureOpen(TechnicalTicket ticket)
    {
        if (ticket.Status != TechnicalTicketStatuses.Open)
        {
            throw new ConflictException($"Ticket {ticket.TicketNo} is {ticket.Status.ToLowerInvariant()}.", "ticket_not_open");
        }
    }

    private async Task AuditAsync(string action, TechnicalTicket ticket, string? reason, CancellationToken cancellationToken) =>
        await audit.RecordAsync(
            new AuditEntry(action, "ROBOT", ticket.RobotId,
                After: new Dictionary<string, object?>
                {
                    ["ticketNo"] = ticket.TicketNo,
                    ["type"] = ticket.Type,
                    ["status"] = ticket.Status,
                    ["result"] = ticket.Result
                },
                Reason: reason),
            cancellationToken);

    private static string? Normalize(string? value, string[] allowed, string errorCode)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var upper = value.Trim().ToUpperInvariant();
        return allowed.Contains(upper)
            ? upper
            : throw new DomainValidationException($"Must be one of {string.Join(", ", allowed)}.", errorCode);
    }

    private static string? Clean(string? value, int max)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    private static string AppendFindings(string? findings, string notes) =>
        string.IsNullOrWhiteSpace(findings) ? notes : $"{findings}\n{notes}";

    private static string SerializeChecklist(IReadOnlyList<TicketChecklistItem> checklist) =>
        JsonSerializer.Serialize(
            checklist.Where(i => !string.IsNullOrWhiteSpace(i.Item)).Take(50)
                .Select(i => new TicketChecklistItem(i.Item.Trim()[..Math.Min(i.Item.Trim().Length, 200)], i.Ok, Clean(i.Note, 500))),
            JsonOptions);

    private static IReadOnlyList<TicketAction> Actions(TechnicalTicket ticket) =>
        Deserialize<List<TicketAction>>(ticket.ActionsJson) ?? [];

    private static T? Deserialize<T>(string? json) where T : class
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static TechnicalTicketResponse ToResponse(TechnicalTicket t)
    {
        JsonElement? snapshot = null;
        if (!string.IsNullOrWhiteSpace(t.SnapshotJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(t.SnapshotJson);
                snapshot = doc.RootElement.Clone();
            }
            catch (JsonException)
            {
            }
        }

        return new TechnicalTicketResponse(
            t.Id, t.TicketNo, t.RobotId, t.RobotCode, t.Type, t.Status, t.Title, t.Description, t.Findings,
            Actions(t), Deserialize<List<TicketChecklistItem>>(t.ChecklistJson) ?? [], t.Result, snapshot,
            t.MaintenanceRecordId, t.IssueId, t.JobId, t.CreatedByName, t.CreatedAt, t.UpdatedAt, t.CompletedByName, t.CompletedAt);
    }

    private static TimeZoneInfo FindVietnam()
    {
        foreach (var id in new[] { "Asia/Ho_Chi_Minh", "SE Asia Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.CreateCustomTimeZone("ICT", TimeSpan.FromHours(7), "ICT", "ICT");
    }
}
