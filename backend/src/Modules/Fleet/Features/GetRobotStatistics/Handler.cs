using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.Fleet.Battery;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.GetRobotStatistics;

public sealed class GetRobotStatisticsHandler(FleetDbContext db, IOptions<BatteryOptions> batteryOptions)
{
    public async Task<RobotStatisticsResponse> HandleAsync(StatisticsRange range, CancellationToken cancellationToken)
    {
        var robots = await db.Robots.AsNoTracking()
            .OrderBy(r => r.Code)
            .Select(r => new { r.Id, r.Code, r.Name, r.Status, r.IsEnabled, r.IsOnline, r.BatteryPercent })
            .ToListAsync(cancellationToken);

        var ended = await db.JobAssignments.AsNoTracking()
            .Where(a => a.EndedAt != null && a.EndedAt >= range.From && a.EndedAt < range.To && a.EndReason != null)
            .Select(a => new { a.RobotId, Reason = a.EndReason!.Value })
            .ToListAsync(cancellationToken);

        int Count(AssignmentEndReason reason) => ended.Count(a => a.Reason == reason);

        var enabled = robots.Where(r => r.IsEnabled).ToList();
        // Only known SOCs count: an unknown battery is neither low nor part of the average.
        var known = enabled.Where(r => r.BatteryPercent is not null).Select(r => r.BatteryPercent!.Value).ToList();
        var lowPercent = batteryOptions.Value.LowPercent;

        return new RobotStatisticsResponse(
            range.From,
            range.To,
            robots.Count,
            enabled.Count,
            robots.Count(r => r.IsOnline),
            known.Count(p => p <= lowPercent),
            known.Count == 0 ? null : (double)known.Average(),
            Enum.GetValues<RobotStatus>()
                .Select(status => new RobotStatusCount(status.ToString(), robots.Count(r => r.Status == status)))
                .ToList(),
            new AssignmentOutcomes(
                Count(AssignmentEndReason.COMPLETED),
                Count(AssignmentEndReason.REASSIGNED),
                Count(AssignmentEndReason.ACK_TIMEOUT),
                Count(AssignmentEndReason.ROBOT_OFFLINE),
                Count(AssignmentEndReason.ROBOT_REJECTED),
                Count(AssignmentEndReason.CANCELLED),
                Count(AssignmentEndReason.FAILED)),
            robots
                .Select(r => new RobotStatisticsRow(
                    r.Id,
                    r.Code,
                    r.Name,
                    r.Status.ToString(),
                    r.IsEnabled,
                    r.IsOnline,
                    r.BatteryPercent,
                    ended.Count(a => a.RobotId == r.Id && a.Reason == AssignmentEndReason.COMPLETED),
                    ended.Count(a => a.RobotId == r.Id && a.Reason != AssignmentEndReason.COMPLETED)))
                .ToList(),
            enabled.Count - known.Count,
            lowPercent);
    }
}
