using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.RobotAvailability;

public sealed class GetRobotAvailabilityHandler(FleetDbContext db, IConfiguration configuration)
{
    private sealed record Boundary(Guid RobotId, DateTimeOffset At, RobotStatus? FromStatus, RobotStatus ToStatus, string? Reason);

    /// <summary>Same key and default as <see cref="Services.RobotHistoryRetentionHostedService"/>.</summary>
    public int RetentionDays => Math.Max(1, configuration.GetValue("Fleet:History:RetentionDays", 90));

    public async Task<RobotAvailabilityResponse> HandleAsync(StatisticsRange range, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var keptSince = now.AddDays(-RetentionDays);
        var until = range.To < now ? range.To : now;
        // Before the history that is kept, nothing can be said; a robot registered later starts later still (below).
        var start = range.From > keptSince ? range.From : keptSince;

        var robots = await db.Robots.AsNoTracking()
            .OrderBy(r => r.Code)
            .Select(r => new { r.Id, r.Code, r.Name, r.IsEnabled, r.IsOnline, r.Status, r.CreatedAt })
            .ToListAsync(cancellationToken);

        var history = new Dictionary<Guid, List<RobotStateChange>>();
        void Keep(Guid robotId, RobotStateChange change)
        {
            if (!history.TryGetValue(robotId, out var list)) history[robotId] = list = [];
            list.Add(change);
        }

        if (start < until && robots.Count > 0)
        {
            var events = db.RobotStateEvents.AsNoTracking();

            foreach (var e in await events
                         .Where(e => e.OccurredAt > start && e.OccurredAt < until)
                         .Select(e => new { e.RobotId, e.OccurredAt, e.FromStatus, e.ToStatus, e.Reason })
                         .ToListAsync(cancellationToken))
            {
                Keep(e.RobotId, new RobotStateChange(e.OccurredAt, e.FromStatus, e.ToStatus, e.Reason));
            }

            // What each robot was at the start: its last change before it, or failing that, its first change after.
            var connectivity = events.Where(e => e.Reason != null && (e.Reason.Contains("online") || e.Reason.Contains("offline")));
            var boundaries = new[]
            {
                events.Where(e => e.OccurredAt <= start).GroupBy(e => e.RobotId)
                    .Select(g => g.OrderByDescending(e => e.OccurredAt)
                        .Select(e => new Boundary(e.RobotId, e.OccurredAt, e.FromStatus, e.ToStatus, e.Reason)).First()),
                connectivity.Where(e => e.OccurredAt <= start).GroupBy(e => e.RobotId)
                    .Select(g => g.OrderByDescending(e => e.OccurredAt)
                        .Select(e => new Boundary(e.RobotId, e.OccurredAt, e.FromStatus, e.ToStatus, e.Reason)).First()),
                events.Where(e => e.OccurredAt >= until).GroupBy(e => e.RobotId)
                    .Select(g => g.OrderBy(e => e.OccurredAt)
                        .Select(e => new Boundary(e.RobotId, e.OccurredAt, e.FromStatus, e.ToStatus, e.Reason)).First()),
                connectivity.Where(e => e.OccurredAt >= until).GroupBy(e => e.RobotId)
                    .Select(g => g.OrderBy(e => e.OccurredAt)
                        .Select(e => new Boundary(e.RobotId, e.OccurredAt, e.FromStatus, e.ToStatus, e.Reason)).First())
            };
            foreach (var boundary in boundaries)
            {
                foreach (var e in await boundary.ToListAsync(cancellationToken))
                {
                    Keep(e.RobotId, new RobotStateChange(e.At, e.FromStatus, e.ToStatus, e.Reason));
                }
            }
        }

        var periodSeconds = Math.Max(0, (until - range.From).TotalSeconds);
        var rows = new List<RobotAvailabilityRow>();
        var fleet = RobotTimeTotals.Empty;
        var fleetPeriod = 0d;
        foreach (var robot in robots)
        {
            var robotStart = robot.CreatedAt > start ? robot.CreatedAt : start;
            var totals = RobotAvailabilityCalculator.Measure(
                robotStart,
                until,
                history.GetValueOrDefault(robot.Id)?.DistinctBy(c => (c.At, c.Reason, c.ToStatus)) ?? [],
                robot.Status,
                robot.IsOnline);
            // A robot registered inside the window was never missing before that, so its own period starts there.
            var robotPeriod = robot.CreatedAt > range.From ? Math.Max(0, (until - robot.CreatedAt).TotalSeconds) : periodSeconds;
            rows.Add(new RobotAvailabilityRow(
                robot.Id,
                robot.Code,
                robot.Name,
                robot.IsEnabled,
                totals.CoveredSeconds > 0 ? robotStart : null,
                Figures(totals, robotPeriod)));
            if (robot.IsEnabled)
            {
                fleet = fleet.Add(totals);
                fleetPeriod += robotPeriod;
            }
        }

        return new RobotAvailabilityResponse(range.From, range.To, until, keptSince, Figures(fleet, fleetPeriod), rows);
    }

    private static RobotAvailabilityFigures Figures(RobotTimeTotals totals, double periodSeconds)
    {
        var covered = totals.CoveredSeconds;
        return new RobotAvailabilityFigures(
            Math.Round(periodSeconds),
            Math.Round(covered),
            Percent(covered, periodSeconds),
            Percent(totals.OnlineSeconds, covered),
            Percent(totals.AvailableSeconds, covered),
            Percent(totals.BusySeconds, covered),
            Enum.GetValues<RobotStatus>()
                .Select(status => new RobotStatusTime(
                    status.ToString(),
                    Math.Round(totals.Seconds(status)),
                    Percent(totals.Seconds(status), covered)))
                .ToList());
    }

    private static double? Percent(double part, double whole) =>
        whole <= 0 ? null : Math.Round(Math.Clamp(part / whole, 0, 1) * 100, 2);
}
