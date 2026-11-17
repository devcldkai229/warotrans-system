using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Services;

namespace WaroTrans.Evidence.Recorder.Features.Journals.Technician;

public sealed record JournalListItem(
    Guid Id,
    Guid TransportRequestId,
    string RequestCode,
    string EvidenceStatus,
    string? SourceTransportStatus,
    int RequestedContainerCount,
    DateTimeOffset? FirstStartedAtUtc,
    DateTimeOffset? LastEndedAtUtc,
    IReadOnlyList<string> Robots,
    int RunCount,
    IReadOnlyDictionary<string, int> IncidentsBySeverity,
    string VideoAvailability);

public sealed record PagedJournals(IReadOnlyList<JournalListItem> Items, int Total, int Page, int PageSize);

public sealed record ReplayRecording(Guid Id, string CameraId, string CameraModel, float? NominalFovDegrees, string Status,
    DateTimeOffset StartedAtUtc, DateTimeOffset? EndedAtUtc, IReadOnlyList<ReplayAsset> Assets, bool HasGaps);

public sealed record ReplayAsset(Guid Id, string Status, long? DurationMs);

public sealed record ReplayRun(
    Guid Id,
    string RunCorrelationKey,
    string RobotCode,
    Guid? RobotSourceId,
    Guid? SourceJobId,
    string? SourceJobNo,
    string? StartReason,
    string EvidenceStatus,
    string? SourceRunStatus,
    IReadOnlyList<Guid> AssignedContainerIds,
    Guid? MapVersionId,
    string? MapVersion,
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? EndedAtUtc,
    double? TimeSyncErrorBoundMs,
    bool TrajectoryAvailable,
    int PlanCount,
    IReadOnlyList<ReplayRecording> Recordings);

public sealed record ReplayManifest(
    Guid JournalId,
    Guid TransportRequestId,
    string RequestCode,
    string EvidenceStatus,
    string? SourceTransportStatus,
    int RequestedContainerCount,
    DateTimeOffset FromUtc,
    DateTimeOffset ToUtc,
    IReadOnlyList<ReplayRun> Runs);

/// <param name="Points">[epochMs, x, y, yaw, valid(1/0)]; an invalid point is a gap, never joined to its neighbours.</param>
public sealed record TrajectoryResponse(Guid RunId, string FrameId, string? MapVersion, int Total, bool Downsampled, IReadOnlyList<double[]> Points);

public sealed record PlanResponse(long PlanVersion, string? PlannerName, DateTimeOffset GeneratedAtUtc, DateTimeOffset? ValidUntilUtc, string? Reason, JsonElement PathPoints);

public sealed record EventResponse(Guid Id, Guid? RunId, string SourceSystem, string Category, string EventType, string Severity,
    DateTimeOffset OccurredAtUtc, double? X, double? Y, string? Message, JsonElement Payload);

public sealed record AnnotationRequest(DateTimeOffset AtUtc, Guid? RunId, string Category, string Note);

public sealed record AnnotationResponse(Guid Id, Guid? RunId, Guid AuthorUserId, string? AuthorName, DateTimeOffset AtUtc, string Category, string Note,
    DateTimeOffset CreatedAtUtc, DateTimeOffset? UpdatedAtUtc);

public sealed record AuditResponse(Guid Id, string Action, string Result, string? ActorName, Guid? ActorUserId, Guid? ResourceId,
    DateTimeOffset OccurredAtUtc, string? IpAddress, string? Detail);

/// <summary>
/// The Technician's Transport Journal API (spec §10.3): find a journal, load its replay manifest, then the path,
/// planned routes and events of a time window. Every read checks the caller's robot scope; views, exports and
/// annotations are audited.
/// </summary>
internal static class TechnicianEndpoints
{
    public const int MaxTrajectoryPoints = 5000;

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/journals", SearchAsync).RequirePermission(Permissions.EvidenceRead).WithName("SearchEvidenceJournals");
        api.MapGet("/journals/{id:guid}/replay", ReplayAsync).RequirePermission(Permissions.EvidenceRead).WithName("GetJournalReplay");
        api.MapGet("/runs/{id:guid}/trajectory", TrajectoryAsync).RequirePermission(Permissions.EvidenceRead).WithName("GetRunTrajectory");
        api.MapGet("/runs/{id:guid}/plans", PlansAsync).RequirePermission(Permissions.EvidenceRead).WithName("GetRunPlans");
        api.MapGet("/journals/{id:guid}/events", EventsAsync).RequirePermission(Permissions.EvidenceRead).WithName("GetJournalEvents");
        api.MapGet("/journals/{id:guid}/annotations", AnnotationsAsync).RequirePermission(Permissions.EvidenceRead).WithName("GetJournalAnnotations");
        api.MapPost("/journals/{id:guid}/annotations", AddAnnotationAsync).RequirePermission(Permissions.EvidenceAnnotate).WithName("AddJournalAnnotation");
        api.MapPut("/journals/{id:guid}/annotations/{annotationId:guid}", EditAnnotationAsync).RequirePermission(Permissions.EvidenceAnnotate).WithName("EditJournalAnnotation");
        api.MapDelete("/journals/{id:guid}/annotations/{annotationId:guid}", DeleteAnnotationAsync).RequirePermission(Permissions.EvidenceAnnotate).WithName("DeleteJournalAnnotation");
        api.MapGet("/journals/{id:guid}/audit", AuditAsync).RequirePermission(Permissions.EvidenceAdmin).WithName("GetJournalAccessAudit");
        api.MapPost("/journals/{id:guid}/export", ExportAsync).RequirePermission(Permissions.EvidenceExport).WithName("ExportJournal");
    }

    // ------------------------------------------------------------------ helpers

    private static IResult Forbidden() =>
        Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "None of this journal's robots is in your scope.");

    private static IResult NotFound(string what) =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: $"No such {what}.");

    /// <summary>The journal if it exists and the caller may see one of its robots.</summary>
    private static async Task<(EvidenceJournal? Journal, IResult? Refusal)> VisibleJournalAsync(
        Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility visibility, CancellationToken ct)
    {
        var journal = await db.Journals.AsNoTracking().FirstOrDefaultAsync(j => j.Id == id, ct);
        if (journal is null)
        {
            return (null, NotFound("journal"));
        }

        var robots = await db.Runs.AsNoTracking().Where(r => r.JournalId == id).Select(r => r.RobotSourceId).ToListAsync(ct);
        return (await visibility.ForAsync(http, ct)).Allows(robots) ? (journal, null) : (null, Forbidden());
    }

    private static async Task<(RobotRunEvidence? Run, IResult? Refusal)> VisibleRunAsync(
        Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility visibility, CancellationToken ct)
    {
        var run = await db.Runs.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (run is null)
        {
            return (null, NotFound("run"));
        }

        return (await visibility.ForAsync(http, ct)).Allows([run.RobotSourceId]) ? (run, null) : (null, Forbidden());
    }

    // ------------------------------------------------------------------ journals

    private static async Task<IResult> SearchAsync(
        HttpContext http, EvidenceDbContext db, RobotVisibility visibility, CancellationToken ct,
        string? search = null, DateTimeOffset? from = null, DateTimeOffset? to = null, string? status = null,
        string? sourceStatus = null, string? robot = null, string? severity = null, int page = 1, int pageSize = 20)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Journals.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(j => EF.Functions.ILike(j.RequestCode, $"%{term}%"));
        }

        if (from is { } f)
        {
            query = query.Where(j => (j.LastEndedAtUtc ?? DateTimeOffset.MaxValue) >= f);
        }

        if (to is { } t)
        {
            query = query.Where(j => j.FirstStartedAtUtc <= t);
        }

        if (Enum.TryParse<EvidenceJournalStatus>(status, out var es))
        {
            query = query.Where(j => j.Status == es);
        }

        if (!string.IsNullOrWhiteSpace(sourceStatus))
        {
            query = query.Where(j => j.TransportStatusSnapshot == sourceStatus);
        }

        if (!string.IsNullOrWhiteSpace(robot))
        {
            query = query.Where(j => db.Runs.Any(r => r.JournalId == j.Id && r.RobotId == robot));
        }

        if (Enum.TryParse<EvidenceSeverity>(severity, out var sev))
        {
            query = query.Where(j => db.Events.Any(e => e.JournalId == j.Id && e.Severity == sev));
        }

        var scope = await visibility.ForAsync(http, ct);
        if (!scope.AllRobots)
        {
            var allowed = scope.RobotIds.ToList();
            query = query.Where(j => db.Runs.Any(r => r.JournalId == j.Id && r.RobotSourceId != null && allowed.Contains(r.RobotSourceId.Value)));
        }

        var total = await query.CountAsync(ct);
        var journals = await query.OrderByDescending(j => j.FirstStartedAtUtc ?? j.CreatedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var ids = journals.Select(j => j.Id).ToList();
        var runs = await db.Runs.AsNoTracking().Where(r => ids.Contains(r.JournalId)).Select(r => new { r.JournalId, r.Id, r.RobotId }).ToListAsync(ct);
        var incidents = await db.Events.AsNoTracking().Where(e => ids.Contains(e.JournalId) && e.Severity != EvidenceSeverity.INFO)
            .GroupBy(e => new { e.JournalId, e.Severity }).Select(g => new { g.Key.JournalId, g.Key.Severity, Count = g.Count() }).ToListAsync(ct);
        var runIds = runs.Select(r => r.Id).ToList();
        var recordings = await db.Recordings.AsNoTracking().Where(r => runIds.Contains(r.RobotRunEvidenceId))
            .Select(r => new { r.RobotRunEvidenceId, r.Status }).ToListAsync(ct);
        var items = journals.Select(j =>
        {
            var jr = runs.Where(r => r.JournalId == j.Id).ToList();
            var recs = recordings.Where(r => jr.Any(x => x.Id == r.RobotRunEvidenceId)).Select(r => r.Status).ToList();
            var video = recs.Count == 0 ? "MISSING"
                : recs.All(s => s == RecordingStatus.READY) ? "READY"
                : recs.Any(s => s is RecordingStatus.PARTIAL or RecordingStatus.FAILED) ? "PARTIAL" : "PROCESSING";
            return new JournalListItem(j.Id, j.TransportRequestId, j.RequestCode, j.Status.ToString(), j.TransportStatusSnapshot,
                j.RequestedContainerCount, j.FirstStartedAtUtc, j.LastEndedAtUtc, jr.Select(r => r.RobotId).Distinct().Order().ToList(), jr.Count,
                incidents.Where(i => i.JournalId == j.Id).ToDictionary(i => i.Severity.ToString(), i => i.Count), video);
        }).ToList();
        return Results.Ok(new PagedJournals(items, total, page, pageSize));
    }

    private static async Task<IResult> ReplayAsync(Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility visibility,
        AccessAuditWriter audit, TimeProvider clock, CancellationToken ct)
    {
        var (journal, refusal) = await VisibleJournalAsync(id, http, db, visibility, ct);
        if (journal is null)
        {
            return refusal!;
        }

        var runs = await db.Runs.AsNoTracking().Where(r => r.JournalId == id).OrderBy(r => r.StartedAtUtc).ToListAsync(ct);
        var runIds = runs.Select(r => r.Id).ToList();
        var recordings = await db.Recordings.AsNoTracking().Where(r => runIds.Contains(r.RobotRunEvidenceId)).OrderBy(r => r.StartedAtUtc).ToListAsync(ct);
        var recIds = recordings.Select(r => r.Id).ToList();
        var assets = await db.MediaAssets.AsNoTracking().Where(a => recIds.Contains(a.RecordingId)).OrderBy(a => a.CreatedAtUtc).ToListAsync(ct);
        var gapGroups = await db.ContinuityGroups.AsNoTracking().Where(g => recIds.Contains(g.RecordingId)).Select(g => new { g.RecordingId, g.GapReason, g.Status }).ToListAsync(ct);
        var withPath = (await db.TrajectoryPoints.AsNoTracking().Where(p => runIds.Contains(p.RobotRunEvidenceId)).Select(p => p.RobotRunEvidenceId).Distinct().ToListAsync(ct)).ToHashSet();
        var plans = await db.RoutePlans.AsNoTracking().Where(p => runIds.Contains(p.RobotRunEvidenceId)).GroupBy(p => p.RobotRunEvidenceId)
            .Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(g => g.Key, g => g.Count, ct);
        var now = clock.GetUtcNow();
        var from = runs.Min(r => r.StartedAtUtc) ?? journal.CreatedAtUtc;
        var to = runs.Count == 0 ? now : runs.Max(r => r.EndedAtUtc ?? now);
        audit.Add(AccessAction.VIEW, AccessResult.ALLOWED, id, detail: "replay");
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReplayManifest(journal.Id, journal.TransportRequestId, journal.RequestCode, journal.Status.ToString(),
            journal.TransportStatusSnapshot, journal.RequestedContainerCount, from, to,
            runs.Select(r => new ReplayRun(r.Id, r.RunCorrelationKey, r.RobotId, r.RobotSourceId, r.SourceJobId, r.SourceJobNo, r.StartReason,
                r.Status.ToString(), r.TransportRunStatusSnapshot, r.AssignedContainerIds, r.MapId, r.MapVersion, r.StartedAtUtc, r.EndedAtUtc,
                r.TimeSyncErrorBoundMs, withPath.Contains(r.Id), plans.GetValueOrDefault(r.Id),
                recordings.Where(c => c.RobotRunEvidenceId == r.Id).Select(c => new ReplayRecording(c.Id, c.CameraId, c.CameraModel,
                    c.NominalFovDegrees, c.Status.ToString(), c.StartedAtUtc, c.EndedAtUtc,
                    assets.Where(a => a.RecordingId == c.Id).Select(a => new ReplayAsset(a.Id, a.Status.ToString(), a.DurationMs)).ToList(),
                    gapGroups.Any(g => g.RecordingId == c.Id && (g.GapReason != null || g.Status == ContinuityGroupStatus.PARTIAL)))).ToList()))
                .ToList()));
    }

    // ------------------------------------------------------------------ run data

    private static async Task<IResult> TrajectoryAsync(Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility visibility,
        CancellationToken ct, DateTimeOffset? from = null, DateTimeOffset? to = null, int maxPoints = 2000)
    {
        var (run, refusal) = await VisibleRunAsync(id, http, db, visibility, ct);
        if (run is null)
        {
            return refusal!;
        }

        maxPoints = Math.Clamp(maxPoints, 10, MaxTrajectoryPoints);
        var query = db.TrajectoryPoints.AsNoTracking().Where(p => p.RobotRunEvidenceId == id);
        if (from is { } f)
        {
            query = query.Where(p => p.CapturedAtUtc >= f);
        }

        if (to is { } t)
        {
            query = query.Where(p => p.CapturedAtUtc <= t);
        }

        var points = await query.OrderBy(p => p.CapturedAtUtc).ThenBy(p => p.SequenceNumber)
            .Select(p => new { p.CapturedAtUtc, p.X, p.Y, p.YawRad, p.IsValid, p.FrameId })
            .ToListAsync(ct);
        // Downsampling keeps every invalid point and its neighbours: a gap must stay a gap.
        var stride = Math.Max(1, (int)Math.Ceiling(points.Count / (double)maxPoints));
        var kept = points.Where((p, i) => i % stride == 0 || i == points.Count - 1 || !p.IsValid
                                          || (i > 0 && !points[i - 1].IsValid) || (i + 1 < points.Count && !points[i + 1].IsValid))
            .Select(p => new[] { p.CapturedAtUtc.ToUnixTimeMilliseconds(), p.X, p.Y, p.YawRad, p.IsValid ? 1.0 : 0.0 })
            .ToList();
        return Results.Ok(new TrajectoryResponse(id, points.FirstOrDefault()?.FrameId ?? "map", run.MapVersion, points.Count, stride > 1, kept));
    }

    private static async Task<IResult> PlansAsync(Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility visibility,
        CancellationToken ct, DateTimeOffset? from = null, DateTimeOffset? to = null)
    {
        var (run, refusal) = await VisibleRunAsync(id, http, db, visibility, ct);
        if (run is null)
        {
            return refusal!;
        }

        var query = db.RoutePlans.AsNoTracking().Where(p => p.RobotRunEvidenceId == id);
        if (from is { } f)
        {
            query = query.Where(p => (p.ValidUntilUtc ?? DateTimeOffset.MaxValue) >= f);
        }

        if (to is { } t)
        {
            query = query.Where(p => p.GeneratedAtUtc <= t);
        }

        var plans = await query.OrderBy(p => p.PlanVersion).ToListAsync(ct);
        return Results.Ok(plans.Select(p => new PlanResponse(p.PlanVersion, p.PlannerName, p.GeneratedAtUtc, p.ValidUntilUtc, p.Reason,
            JsonDocument.Parse(p.PathPoints).RootElement.Clone())).ToList());
    }

    private static async Task<IResult> EventsAsync(Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility visibility,
        CancellationToken ct, string? severity = null, string? category = null, DateTimeOffset? from = null, DateTimeOffset? to = null, int limit = 1000)
    {
        var (journal, refusal) = await VisibleJournalAsync(id, http, db, visibility, ct);
        if (journal is null)
        {
            return refusal!;
        }

        var query = db.Events.AsNoTracking().Where(e => e.JournalId == id);
        if (!string.IsNullOrWhiteSpace(severity))
        {
            var wanted = severity.Split(',').Select(s => Enum.TryParse<EvidenceSeverity>(s.Trim(), out var v) ? v : (EvidenceSeverity?)null)
                .Where(v => v is not null).Select(v => v!.Value).ToList();
            query = query.Where(e => wanted.Contains(e.Severity));
        }

        if (Enum.TryParse<EvidenceEventCategory>(category, out var cat))
        {
            query = query.Where(e => e.Category == cat);
        }

        if (from is { } f)
        {
            query = query.Where(e => e.OccurredAtUtc >= f);
        }

        if (to is { } t)
        {
            query = query.Where(e => e.OccurredAtUtc <= t);
        }

        var events = await query.OrderBy(e => e.OccurredAtUtc).Take(Math.Clamp(limit, 1, 5000)).ToListAsync(ct);
        return Results.Ok(events.Select(e => new EventResponse(e.Id, e.RobotRunEvidenceId, e.SourceSystem, e.Category.ToString(), e.EventType,
            e.Severity.ToString(), e.OccurredAtUtc, e.X, e.Y, e.Message, JsonDocument.Parse(e.Payload).RootElement.Clone())).ToList());
    }

    // ------------------------------------------------------------------ annotations

    private static AnnotationResponse ToResponse(EvidenceAnnotation a) =>
        new(a.Id, a.RobotRunEvidenceId, a.AuthorUserId, a.AuthorName, a.AtUtc, a.Category.ToString(), a.Note, a.CreatedAtUtc, a.UpdatedAtUtc);

    private static async Task<IResult> AnnotationsAsync(Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility visibility, CancellationToken ct)
    {
        var (journal, refusal) = await VisibleJournalAsync(id, http, db, visibility, ct);
        if (journal is null)
        {
            return refusal!;
        }

        var list = await db.Annotations.AsNoTracking().Where(a => a.JournalId == id && a.DeletedAtUtc == null).OrderBy(a => a.AtUtc).ToListAsync(ct);
        return Results.Ok(list.Select(ToResponse).ToList());
    }

    private static string? Problem(AnnotationRequest r) =>
        string.IsNullOrWhiteSpace(r.Note) ? "note is required"
        : r.Note.Length > 4000 ? "note is longer than 4000 characters"
        : !Enum.TryParse<AnnotationCategory>(r.Category, out _) ? "category must be NOTE, OBSERVATION, ROOT_CAUSE or ACTION"
        : null;

    private static async Task<IResult> AddAnnotationAsync(Guid id, AnnotationRequest request, HttpContext http, ClaimsPrincipal user,
        EvidenceDbContext db, RobotVisibility visibility, AccessAuditWriter audit, TimeProvider clock, CancellationToken ct)
    {
        if (Problem(request) is { } problem)
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: problem);
        }

        var (journal, refusal) = await VisibleJournalAsync(id, http, db, visibility, ct);
        if (journal is null)
        {
            return refusal!;
        }

        if (request.RunId is { } runId && !await db.Runs.AnyAsync(r => r.Id == runId && r.JournalId == id, ct))
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "runId is not a run of this journal.");
        }

        var annotation = new EvidenceAnnotation
        {
            Id = Guid.NewGuid(),
            JournalId = id,
            RobotRunEvidenceId = request.RunId,
            AuthorUserId = Guid.TryParse(user.FindFirstValue(AppClaimTypes.Subject), out var author) ? author : Guid.Empty,
            AuthorName = user.FindFirstValue(AppClaimTypes.Name),
            AtUtc = request.AtUtc,
            Category = Enum.Parse<AnnotationCategory>(request.Category),
            Note = request.Note.Trim(),
            CreatedAtUtc = clock.GetUtcNow()
        };
        db.Annotations.Add(annotation);
        audit.Add(AccessAction.ANNOTATE, AccessResult.ALLOWED, id, annotation.Id, $"add {annotation.Category}");
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/evidence/journals/{id}/annotations/{annotation.Id}", ToResponse(annotation));
    }

    private static async Task<IResult> EditAnnotationAsync(Guid id, Guid annotationId, AnnotationRequest request, ClaimsPrincipal user,
        EvidenceDbContext db, AccessAuditWriter audit, TimeProvider clock, CancellationToken ct)
    {
        if (Problem(request) is { } problem)
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: problem);
        }

        var annotation = await db.Annotations.FirstOrDefaultAsync(a => a.Id == annotationId && a.JournalId == id && a.DeletedAtUtc == null, ct);
        if (annotation is null)
        {
            return NotFound("annotation");
        }

        // Only the author changes a note (admins may delete); every change is audited.
        if (annotation.AuthorUserId.ToString() != user.FindFirstValue(AppClaimTypes.Subject))
        {
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only the author edits a note.");
        }

        annotation.AtUtc = request.AtUtc;
        annotation.Category = Enum.Parse<AnnotationCategory>(request.Category);
        annotation.Note = request.Note.Trim();
        annotation.UpdatedAtUtc = clock.GetUtcNow();
        audit.Add(AccessAction.ANNOTATE, AccessResult.ALLOWED, id, annotation.Id, "edit");
        await db.SaveChangesAsync(ct);
        return Results.Ok(ToResponse(annotation));
    }

    private static async Task<IResult> DeleteAnnotationAsync(Guid id, Guid annotationId, ClaimsPrincipal user, EvidenceDbContext db,
        AccessAuditWriter audit, TimeProvider clock, CancellationToken ct)
    {
        var annotation = await db.Annotations.FirstOrDefaultAsync(a => a.Id == annotationId && a.JournalId == id && a.DeletedAtUtc == null, ct);
        if (annotation is null)
        {
            return NotFound("annotation");
        }

        var isAuthor = annotation.AuthorUserId.ToString() == user.FindFirstValue(AppClaimTypes.Subject);
        if (!isAuthor && !RolePermissionMatrix.UserHas(user, Permissions.EvidenceAdmin))
        {
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only the author or an admin removes a note.");
        }

        annotation.DeletedAtUtc = clock.GetUtcNow(); // kept for the audit trail
        audit.Add(AccessAction.ANNOTATE, AccessResult.ALLOWED, id, annotation.Id, "delete");
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ------------------------------------------------------------------ audit, export

    private static async Task<IResult> AuditAsync(Guid id, EvidenceDbContext db, CancellationToken ct)
    {
        var rows = await db.AccessAudits.AsNoTracking().Where(a => a.JournalId == id).OrderByDescending(a => a.OccurredAtUtc).Take(500).ToListAsync(ct);
        return Results.Ok(rows.Select(a => new AuditResponse(a.Id, a.Action.ToString(), a.Result.ToString(), a.ActorName, a.ActorUserId,
            a.ResourceId, a.OccurredAtUtc, a.IpAddress?.ToString(), a.Detail)).ToList());
    }

    /// <summary>
    /// An evidence packet manifest (spec §7.3): the journal, its runs, events, annotations and every original segment with
    /// its storage key and SHA-256, so the originals can be fetched and checked independently of the HLS renditions.
    /// </summary>
    private static async Task<IResult> ExportAsync(Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility visibility,
        AccessAuditWriter audit, TimeProvider clock, CancellationToken ct)
    {
        var (journal, refusal) = await VisibleJournalAsync(id, http, db, visibility, ct);
        if (journal is null)
        {
            return refusal!;
        }

        var runs = await db.Runs.AsNoTracking().Where(r => r.JournalId == id).ToListAsync(ct);
        var runIds = runs.Select(r => r.Id).ToList();
        var recordings = await db.Recordings.AsNoTracking().Where(r => runIds.Contains(r.RobotRunEvidenceId)).ToListAsync(ct);
        var recIds = recordings.Select(r => r.Id).ToList();
        var segments = await db.Segments.AsNoTracking().Where(s => recIds.Contains(s.RecordingId)).OrderBy(s => s.RecordingId).ThenBy(s => s.SequenceNumber)
            .Select(s => new { s.RecordingId, s.SequenceNumber, s.CapturedFromUtc, s.CapturedToUtc, s.S3Bucket, s.S3Key, s.Sha256, s.ByteSize, UploadStatus = s.UploadStatus.ToString() })
            .ToListAsync(ct);
        var events = await db.Events.AsNoTracking().Where(e => e.JournalId == id).OrderBy(e => e.OccurredAtUtc)
            .Select(e => new { e.OccurredAtUtc, e.RobotRunEvidenceId, Category = e.Category.ToString(), e.EventType, Severity = e.Severity.ToString(), e.Message, e.X, e.Y })
            .ToListAsync(ct);
        var annotations = await db.Annotations.AsNoTracking().Where(a => a.JournalId == id && a.DeletedAtUtc == null).ToListAsync(ct);
        audit.Add(AccessAction.EXPORT, AccessResult.ALLOWED, id, detail: "manifest");
        await db.SaveChangesAsync(ct);
        var packet = new
        {
            schemaVersion = 1,
            exportedAtUtc = clock.GetUtcNow(),
            journal = new { journal.Id, journal.TransportRequestId, journal.RequestCode, EvidenceStatus = journal.Status.ToString(), SourceTransportStatus = journal.TransportStatusSnapshot, journal.RequestedContainerCount, journal.FirstStartedAtUtc, journal.LastEndedAtUtc },
            runs = runs.Select(r => new { r.Id, r.RunCorrelationKey, robot = r.RobotId, r.SourceJobId, r.SourceJobNo, EvidenceStatus = r.Status.ToString(), SourceRunStatus = r.TransportRunStatusSnapshot, r.AssignedContainerIds, r.MapVersion, r.StartedAtUtc, r.EndedAtUtc, r.TimeSyncErrorBoundMs }),
            recordings = recordings.Select(c => new { c.Id, c.RobotRunEvidenceId, c.CameraId, c.CameraModel, c.NominalFovDegrees, c.Width, c.Height, c.TargetFps, Status = c.Status.ToString(), c.StartedAtUtc, c.EndedAtUtc, c.ExpectedSegmentCount }),
            originalSegments = segments,
            events,
            annotations = annotations.Select(ToResponse)
        };
        return Results.File(JsonSerializer.SerializeToUtf8Bytes(packet, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true }),
            "application/json", $"evidence-{journal.RequestCode}.json");
    }
}
