using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.GetRobotStatistics;

public sealed class GetRobotStatisticsHandler(FleetDbContext db)
{
    /// <summary>A robot at or below this charge is counted as low on battery.</summary>
    public const decimal LowBatteryPercent = 20m;

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

        return new RobotStatisticsResponse(
            range.From,
            range.To,
            robots.Count,
            enabled.Count,
            robots.Count(r => r.IsOnline),
            enabled.Count(r => r.BatteryPercent <= LowBatteryPercent),
            enabled.Count == 0 ? null : (double)enabled.Average(r => r.BatteryPercent),
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
                .ToList());
    }
}
