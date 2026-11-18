using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Persistence;

namespace WaroTrans.Evidence.Recorder.Features.Runs;

/// <summary>What the source says about one robot assignment (one run).</summary>
internal sealed record AssignmentFacts(
    Guid AssignmentId,
    Guid JobId,
    string? JobNo,
    Guid? RobotSourceId,
    string? RobotCode,
    string? StartReason,
    DateTimeOffset? StartedAt,
    DateTimeOffset? EndedAt,
    string? EndReason,
    string? JobStatus,
    IReadOnlyList<Guid>? ContainerIds,
    Guid? MapVersionId,
    string? MapVersionCode);

/// <summary>
/// Creates or completes the run of an assignment, from an event or from reconciliation, in any order and any number of
/// times (an assignment CLOSED that arrives before its OPENED still makes one correct run).
/// </summary>
internal sealed class RunUpserter(EvidenceDbContext db, TimeProvider clock)
{
    public async Task<RobotRunEvidence> ApplyAsync(EvidenceJournal journal, AssignmentFacts facts, CancellationToken cancellationToken)
    {
        var key = RobotRunEvidence.KeyFor(facts.AssignmentId);
        var now = clock.GetUtcNow();
        var run = db.Runs.Local.FirstOrDefault(r => r.JournalId == journal.Id && r.RunCorrelationKey == key)
                  ?? await db.Runs.FirstOrDefaultAsync(r => r.JournalId == journal.Id && r.RunCorrelationKey == key, cancellationToken);
        if (run is null)
        {
            run = new RobotRunEvidence
            {
                Id = Guid.NewGuid(),
                JournalId = journal.Id,
                RunCorrelationKey = key,
                FrameId = "map",
                CreatedAtUtc = now
            };
            db.Runs.Add(run);
        }

        run.SourceJobId = facts.JobId;
        run.SourceAssignmentId = facts.AssignmentId;
        run.SourceJobNo = facts.JobNo ?? run.SourceJobNo;
        run.RobotSourceId = facts.RobotSourceId ?? run.RobotSourceId;
        run.RobotId = facts.RobotCode ?? (run.RobotId.Length > 0 ? run.RobotId : facts.RobotSourceId?.ToString("D") ?? "unknown");
        run.StartReason = facts.StartReason ?? run.StartReason;
        if (facts.StartedAt is { } started && (run.StartedAtUtc is null || started < run.StartedAtUtc))
        {
            run.StartedAtUtc = started;
        }

        if (facts.ContainerIds is { Count: > 0 } containers)
        {
            run.AssignedContainerIds = containers.ToList();
        }

        run.MapId = facts.MapVersionId ?? run.MapId;
        run.MapVersion = facts.MapVersionCode ?? run.MapVersion;
        if (facts.EndedAt is { } ended)
        {
            run.EndedAtUtc = ended;
            run.TransportRunStatusSnapshot = facts.EndReason ?? facts.JobStatus ?? run.TransportRunStatusSnapshot;
        }
        else if (run.EndedAtUtc is null && facts.JobStatus is not null)
        {
            run.TransportRunStatusSnapshot = facts.JobStatus;
        }

        run.UpdatedAtUtc = now;
        return run;
    }
}
