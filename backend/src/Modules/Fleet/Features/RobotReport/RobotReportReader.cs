using Microsoft.EntityFrameworkCore;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.RobotReport;

/// <summary>FE-20 detail export: what the Fleet knows about Jobs that the Job rows themselves do not carry.</summary>
public sealed class RobotReportReader(FleetDbContext db)
{
    /// <summary>The robot each Job was last assigned to (a reassigned Job names the robot that had it last).</summary>
    public async Task<IReadOnlyDictionary<Guid, string>> LastRobotCodeByJobAsync(
        IReadOnlyCollection<Guid> jobIds,
        CancellationToken cancellationToken)
    {
        var result = new Dictionary<Guid, string>();
        // Batched so a long period does not send tens of thousands of ids in one IN list.
        foreach (var batch in jobIds.Distinct().Chunk(1000))
        {
            var rows = await db.JobAssignments.AsNoTracking()
                .Where(a => batch.Contains(a.JobId))
                .Join(db.Robots.AsNoTracking(), a => a.RobotId, r => r.Id, (a, r) => new { a.JobId, a.AssignedAt, r.Code })
                .ToListAsync(cancellationToken);
            foreach (var row in rows.GroupBy(r => r.JobId))
            {
                result[row.Key] = row.OrderByDescending(r => r.AssignedAt).First().Code;
            }
        }

        return result;
    }
}
