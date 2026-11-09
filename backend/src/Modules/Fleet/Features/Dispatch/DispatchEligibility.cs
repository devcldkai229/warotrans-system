using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.Dispatch;

/// <summary>
/// FL-01: decides, for one robot, whether it may take new work and how good a choice it is. Pure: everything it needs
/// is passed in, so the same answer is shown in the UI, stored in the DispatchDecision and enforced by Start.
/// </summary>
public static class DispatchEligibility
{
    public const string BatteryOk = "OK";
    public const string BatteryLowState = "LOW";
    public const string BatteryCritical = "CRITICAL";
    public const string BatteryUnknownState = "UNKNOWN";
    public const string BatteryStaleState = "STALE";

    /// <summary>OK / LOW / CRITICAL / UNKNOWN (never measured) / STALE (measured too long ago).</summary>
    public static string BatteryStateOf(Robot robot, DateTimeOffset now, BatteryOptions battery) =>
        robot.BatteryMeasuredAt is not { } measured ? BatteryUnknownState
        : now - measured > TimeSpan.FromSeconds(battery.StaleSeconds) ? BatteryStaleState
        : robot.BatteryPercent <= battery.CriticalPercent ? BatteryCritical
        : robot.BatteryPercent <= battery.LowPercent ? BatteryLowState
        : BatteryOk;

    public static DispatchCandidate Evaluate(
        Robot robot,
        DispatchQuery query,
        DateTimeOffset now,
        DateTimeOffset? lastCommandAt,
        BatteryOptions battery,
        DispatchOptions weights)
    {
        var reasons = new List<string>();
        if (!robot.IsEnabled) reasons.Add(DispatchReasons.Disabled);
        if (!robot.IsOnline) reasons.Add(DispatchReasons.Offline);
        if (robot.Status == RobotStatus.MAINTENANCE) reasons.Add(DispatchReasons.InMaintenance);
        else if (robot.IsOnline && robot.Status != RobotStatus.AVAILABLE) reasons.Add(DispatchReasons.NotAvailable);
        if (robot.MotionHeld) reasons.Add(DispatchReasons.MotionHeld);
        if (robot.HasActiveManualLease(now)) reasons.Add(DispatchReasons.ManualMode);
        if (robot.CurrentMapVersionId != query.MapVersionId) reasons.Add(DispatchReasons.MapMismatch);
        if (robot.LocalizationStatus != LocalizationStatus.LOCALIZED) reasons.Add(DispatchReasons.NotLocalized);
        if (query.BusyRobotIds.Contains(robot.Id)) reasons.Add(DispatchReasons.Busy);

        var batteryState = BatteryStateOf(robot, now, battery);
        var known = batteryState is not (BatteryUnknownState or BatteryStaleState);
        switch (batteryState)
        {
            case BatteryUnknownState when !battery.AllowUnknownBatteryDispatch:
                reasons.Add(DispatchReasons.BatteryUnknown);
                break;
            case BatteryStaleState:
                reasons.Add(DispatchReasons.BatteryStale);
                break;
            default:
                if (known && robot.BatteryPercent < battery.MinDispatchPercent)
                {
                    reasons.Add(DispatchReasons.BatteryLow);
                }

                break;
        }

        double? distance = query.PickupX is { } px && query.PickupY is { } py && robot.LocalizationStatus == LocalizationStatus.LOCALIZED
            ? Math.Round(Math.Sqrt(Math.Pow(robot.PoseX - px, 2) + Math.Pow(robot.PoseY - py, 2)), 2)
            : null;
        double? idle = lastCommandAt is { } last ? Math.Max(0, (now - last).TotalSeconds) : null;

        // Lower is better. An unknown battery scores as if half full: it is neither rewarded nor punished.
        var soc = known ? (double)robot.BatteryPercent : 50.0;
        var score = (distance ?? 0) * weights.DistanceWeight
                    + (100 - soc) * weights.BatteryWeight
                    - Math.Min(idle ?? weights.IdleCapSeconds, weights.IdleCapSeconds) / Math.Max(1, weights.IdleCapSeconds) * weights.IdleBonus;

        return new DispatchCandidate(
            robot.Id,
            robot.Code,
            reasons.Count == 0,
            reasons,
            known ? robot.BatteryPercent : null,
            batteryState,
            distance,
            idle is null ? null : Math.Round(idle.Value),
            Math.Round(score, 3),
            robot.Status.ToString(),
            robot.IsOnline);
    }

    /// <summary>Eligible robots first, best score first; then the rest, by code.</summary>
    public static IReadOnlyList<DispatchCandidate> Rank(IEnumerable<DispatchCandidate> candidates) =>
        candidates
            .OrderByDescending(c => c.Eligible)
            .ThenBy(c => c.Eligible ? c.Score : double.MaxValue)
            .ThenBy(c => c.RobotCode, StringComparer.Ordinal)
            .ToList();
}
