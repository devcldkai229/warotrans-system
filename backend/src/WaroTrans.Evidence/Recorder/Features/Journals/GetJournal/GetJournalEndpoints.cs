using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Services;

namespace WaroTrans.Evidence.Recorder.Features.Journals.GetJournal;

public sealed record JournalDetailResponse(
    Guid Id,
    Guid TransportRequestId,
    string RequestCode,
    string EvidenceStatus,
    string? SourceTransportStatus,
    int RequestedContainerCount,
    DateTimeOffset? FirstStartedAtUtc,
    DateTimeOffset? LastEndedAtUtc,
    IReadOnlyList<RunSummaryResponse> Runs,
    IReadOnlyDictionary<string, int> EventsBySeverity);

public sealed record RunSummaryResponse(
    Guid Id,
    string RunCorrelationKey,
    string RobotCode,
    Guid? RobotSourceId,
    Guid? SourceJobId,
    string? SourceJobNo,
    string? StartReason,
    string EvidenceStatus,
    string? SourceRunStatus,
    int AssignedContainerCount,
    IReadOnlyList<Guid> AssignedContainerIds,
    string? MapVersion,
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? EndedAtUtc);

/// <summary>A journal with its runs, by id or by the transport request it belongs to.</summary>
internal static class GetJournalEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/journals/{id:guid}", (Guid id, HttpContext http, EvidenceDbContext db, RobotVisibility scope, AccessAuditWriter audit, CancellationToken ct) =>
                GetAsync(db.Journals.Where(j => j.Id == id), http, db, scope, audit, ct))
            .RequirePermission(Permissions.EvidenceRead)
            .WithName("GetEvidenceJournal");

        group.MapGet("/journals/by-transport-request/{transportRequestId:guid}", (Guid transportRequestId, HttpContext http, EvidenceDbContext db, RobotVisibility scope, AccessAuditWriter audit, CancellationToken ct) =>
                GetAsync(db.Journals.Where(j => j.TransportRequestId == transportRequestId), http, db, scope, audit, ct))
            .RequirePermission(Permissions.EvidenceRead)
            .WithName("GetEvidenceJournalByTransportRequest");
    }

    private static async Task<IResult> GetAsync(
        IQueryable<EvidenceJournal> query, HttpContext http, EvidenceDbContext db, RobotVisibility scope, AccessAuditWriter audit, CancellationToken ct)
    {
        var journal = await query.AsNoTracking().FirstOrDefaultAsync(ct);
        if (journal is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "No evidence journal for this request yet.");
        }

        var runs = await db.Runs.AsNoTracking().Where(r => r.JournalId == journal.Id).OrderBy(r => r.StartedAtUtc).ToListAsync(ct);
        var allowed = await scope.ForAsync(http, ct);
        if (!allowed.Allows(runs.Select(r => r.RobotSourceId)))
        {
            audit.Add(AccessAction.VIEW, AccessResult.DENIED, journal.Id, detail: "robot_out_of_scope");
            await db.SaveChangesAsync(ct);
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "None of this journal's robots is in your scope.");
        }

        var bySeverity = await db.Events.AsNoTracking()
            .Where(e => e.JournalId == journal.Id)
            .GroupBy(e => e.Severity)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Key.ToString(), g => g.Count, ct);
        audit.Add(AccessAction.VIEW, AccessResult.ALLOWED, journal.Id);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new JournalDetailResponse(
            journal.Id, journal.TransportRequestId, journal.RequestCode, journal.Status.ToString(), journal.TransportStatusSnapshot,
            journal.RequestedContainerCount, journal.FirstStartedAtUtc, journal.LastEndedAtUtc,
            runs.Select(r => new RunSummaryResponse(
                r.Id, r.RunCorrelationKey, r.RobotId, r.RobotSourceId, r.SourceJobId, r.SourceJobNo, r.StartReason,
                r.Status.ToString(), r.TransportRunStatusSnapshot, r.AssignedContainerIds.Count, r.AssignedContainerIds,
                r.MapVersion, r.StartedAtUtc, r.EndedAtUtc)).ToList(),
            bySeverity));
    }
}
