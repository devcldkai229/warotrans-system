using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.Dispatch;

/// <summary>FL-01 evaluation over the fleet and FLT-01 decision log.</summary>
public sealed class DispatchService(
    FleetDbContext db,
    IOptions<BatteryOptions> battery,
    IOptions<DispatchOptions> weights,
    TimeProvider clock)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Every robot of the map's warehouse, ranked; robots on another map are listed as such.</summary>
    public async Task<IReadOnlyList<DispatchCandidate>> EvaluateAsync(DispatchQuery query, CancellationToken cancellationToken)
    {
        var warehouseIds = await db.Robots.AsNoTracking()
            .Where(r => r.CurrentMapVersionId == query.MapVersionId)
            .Select(r => r.WarehouseId)
            .Distinct()
            .ToListAsync(cancellationToken);
        var robots = await db.Robots.AsNoTracking()
            .Where(r => r.CurrentMapVersionId == query.MapVersionId || warehouseIds.Contains(r.WarehouseId))
            .ToListAsync(cancellationToken);
        var ids = robots.Select(r => r.Id).ToList();
        var lastCommands = await db.RobotCommands.AsNoTracking()
            .Where(c => ids.Contains(c.RobotId))
            .GroupBy(c => c.RobotId)
            .Select(g => new { RobotId = g.Key, Last = g.Max(c => c.IssuedAt) })
            .ToDictionaryAsync(x => x.RobotId, x => x.Last, cancellationToken);

        var now = clock.GetUtcNow();
        return DispatchEligibility.Rank(robots.Select(r =>
            DispatchEligibility.Evaluate(r, query, now, lastCommands.TryGetValue(r.Id, out var last) ? last : null, battery.Value, weights.Value)));
    }

    public async Task RecordAsync(DispatchDecisionRecord record, CancellationToken cancellationToken)
    {
        db.DispatchDecisions.Add(new DispatchDecision
        {
            Id = Guid.NewGuid(),
            JobId = record.JobId,
            RobotId = record.SelectedRobotId,
            Type = record.SelectedRobotId is null ? DispatchDecisionType.NONE : DispatchDecisionType.SELECTED,
            Trigger = record.Trigger,
            ActorId = record.ActorId,
            OverrideReason = record.OverrideReason,
            CandidateEvaluations = JsonSerializer.SerializeToDocument(record.Candidates, Json),
            CreatedAt = clock.GetUtcNow()
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<DispatchDecisionView>> ListAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var rows = await db.DispatchDecisions.AsNoTracking()
            .Where(d => d.JobId == jobId)
            .OrderByDescending(d => d.CreatedAt)
            .Take(20)
            .ToListAsync(cancellationToken);
        return rows.Select(d => new DispatchDecisionView(
                d.Id, d.JobId, d.RobotId, d.Type.ToString(), d.Trigger ?? DispatchTriggers.Start, d.ActorId, d.OverrideReason, d.CreatedAt,
                d.CandidateEvaluations.Deserialize<List<DispatchCandidate>>(Json) ?? []))
            .ToList();
    }
}
