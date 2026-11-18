using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Status;

namespace WaroTrans.Evidence.Recorder.Features.Journals;

/// <summary>Recomputes run and journal evidence statuses and the journal's time range from what is stored.</summary>
internal sealed class JournalStatusService(EvidenceDbContext db, IOptions<RecorderOptions> options, TimeProvider clock)
{
    /// <returns>True when something changed (the caller saves).</returns>
    public async Task<bool> RecomputeAsync(EvidenceJournal journal, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var runs = await db.Runs.Where(r => r.JournalId == journal.Id).ToListAsync(cancellationToken);
        foreach (var added in db.Runs.Local.Where(r => r.JournalId == journal.Id && !runs.Contains(r)))
        {
            runs.Add(added);
        }

        var runIds = runs.Select(r => r.Id).ToList();
        var recordings = (await db.Recordings.AsNoTracking()
                .Where(r => runIds.Contains(r.RobotRunEvidenceId))
                .Select(r => new { r.RobotRunEvidenceId, r.Status })
                .ToListAsync(cancellationToken))
            .GroupBy(r => r.RobotRunEvidenceId)
            .ToDictionary(g => g.Key, g => g.Select(r => r.Status).ToList());
        var withTrajectory = (await db.TrajectoryPoints.AsNoTracking()
                .Where(p => runIds.Contains(p.RobotRunEvidenceId))
                .Select(p => p.RobotRunEvidenceId)
                .Distinct()
                .ToListAsync(cancellationToken))
            .ToHashSet();

        var changed = false;
        foreach (var run in runs)
        {
            var status = EvidenceStatusCalculator.Run(
                new RunFacts(run.EndedAtUtc, recordings.GetValueOrDefault(run.Id) ?? [], withTrajectory.Contains(run.Id)),
                now, options.Value.Policy);
            if (status != run.Status)
            {
                run.Status = status;
                run.UpdatedAtUtc = now;
                changed = true;
            }
        }

        var journalStatus = EvidenceStatusCalculator.Journal(runs.Select(r => r.Status).ToList(), journal.TransportStatusSnapshot);
        var first = runs.Min(r => r.StartedAtUtc);
        var last = runs.Count > 0 && runs.All(r => r.EndedAtUtc is not null) ? runs.Max(r => r.EndedAtUtc) : null;
        if (journalStatus != journal.Status || first != journal.FirstStartedAtUtc || last != journal.LastEndedAtUtc)
        {
            journal.Status = journalStatus;
            journal.FirstStartedAtUtc = first;
            journal.LastEndedAtUtc = last;
            Touch(journal, now);
            changed = true;
        }

        return changed;
    }

    public static void Touch(EvidenceJournal journal, DateTimeOffset now)
    {
        journal.UpdatedAtUtc = now;
        journal.RowVersion++;
    }
}
