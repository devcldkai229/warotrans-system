using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.RobotAvailability;

/// <summary>One recorded change of a robot (a row of <c>robot_state_events</c>), only what the timeline needs.</summary>
public sealed record RobotStateChange(DateTimeOffset At, RobotStatus? FromStatus, RobotStatus ToStatus, string? Reason)
{
    /// <summary>
    /// True when the robot came online with this change, false when it went offline, null when its connection did not
    /// change. <c>Reason</c> is a comma-separated list such as <c>status,offline</c>.
    /// </summary>
    public bool? Connectivity
    {
        get
        {
            if (string.IsNullOrEmpty(Reason)) return null;
            foreach (var part in Reason.Split(',', StringSplitOptions.TrimEntries))
            {
                if (part == "online") return true;
                if (part == "offline") return false;
            }

            return null;
        }
    }
}

/// <summary>How long one robot spent in each status inside a stretch of time.</summary>
public sealed record RobotTimeTotals(double CoveredSeconds, double OnlineSeconds, IReadOnlyDictionary<RobotStatus, double> SecondsByStatus)
{
    public static readonly RobotTimeTotals Empty = new(0, 0, new Dictionary<RobotStatus, double>());

    public double Seconds(RobotStatus status) => SecondsByStatus.GetValueOrDefault(status);

    /// <summary>Could take work: online and neither in maintenance nor in error.</summary>
    public double AvailableSeconds =>
        CoveredSeconds - Seconds(RobotStatus.OFFLINE) - Seconds(RobotStatus.MAINTENANCE) - Seconds(RobotStatus.ERROR);

    /// <summary>Held for, or carrying out, a Job.</summary>
    public double BusySeconds =>
        Seconds(RobotStatus.RESERVED) + Seconds(RobotStatus.EXECUTING) + Seconds(RobotStatus.PAUSED);

    public RobotTimeTotals Add(RobotTimeTotals other)
    {
        var byStatus = new Dictionary<RobotStatus, double>(SecondsByStatus);
        foreach (var (status, seconds) in other.SecondsByStatus)
        {
            byStatus[status] = byStatus.GetValueOrDefault(status) + seconds;
        }

        return new RobotTimeTotals(CoveredSeconds + other.CoveredSeconds, OnlineSeconds + other.OnlineSeconds, byStatus);
    }
}

/// <summary>
/// FE-20 robot availability: replays a robot's recorded changes over <c>[start, end)</c>. The status counted for a moment
/// is the one the console shows: a robot that is not connected counts as OFFLINE unless it is in MAINTENANCE or ERROR,
/// which say more than the lost connection does.
/// </summary>
public static class RobotAvailabilityCalculator
{
    /// <param name="history">
    /// The robot's changes, any order. To know the state at <paramref name="start"/> it needs the last change at or before
    /// it (and the last one that changed the connection); without one, the first change after <paramref name="start"/>
    /// tells what the robot was before it. With no change at all the robot was as it is now the whole time.
    /// </param>
    public static RobotTimeTotals Measure(
        DateTimeOffset start,
        DateTimeOffset end,
        IEnumerable<RobotStateChange> history,
        RobotStatus currentStatus,
        bool currentOnline)
    {
        if (end <= start) return RobotTimeTotals.Empty;

        var changes = history.OrderBy(c => c.At).ToList();
        var status = StatusAt(start, changes, currentStatus);
        var online = OnlineAt(start, changes, currentOnline);

        var byStatus = new Dictionary<RobotStatus, double>();
        double onlineSeconds = 0;
        var cursor = start;

        void Spend(DateTimeOffset until)
        {
            var seconds = (until - cursor).TotalSeconds;
            if (seconds <= 0) return;
            var shown = Shown(status, online);
            byStatus[shown] = byStatus.GetValueOrDefault(shown) + seconds;
            if (online) onlineSeconds += seconds;
            cursor = until;
        }

        foreach (var change in changes.Where(c => c.At > start && c.At < end))
        {
            Spend(change.At);
            status = change.ToStatus;
            online = change.Connectivity ?? online;
        }

        Spend(end);
        return new RobotTimeTotals((end - start).TotalSeconds, onlineSeconds, byStatus);
    }

    public static RobotStatus Shown(RobotStatus status, bool online) =>
        online || status is RobotStatus.MAINTENANCE or RobotStatus.ERROR ? status : RobotStatus.OFFLINE;

    private static RobotStatus StatusAt(DateTimeOffset start, List<RobotStateChange> changes, RobotStatus current)
    {
        var before = changes.LastOrDefault(c => c.At <= start);
        if (before is not null) return before.ToStatus;
        var after = changes.FirstOrDefault(c => c.At > start);
        return after is null ? current : after.FromStatus ?? after.ToStatus;
    }

    private static bool OnlineAt(DateTimeOffset start, List<RobotStateChange> changes, bool current)
    {
        var before = changes.LastOrDefault(c => c.At <= start && c.Connectivity is not null);
        if (before is not null) return before.Connectivity!.Value;
        var after = changes.FirstOrDefault(c => c.At > start && c.Connectivity is not null);
        return after is null ? current : !after.Connectivity!.Value;
    }
}
