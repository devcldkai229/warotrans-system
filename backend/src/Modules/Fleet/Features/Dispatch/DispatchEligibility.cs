using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Navigation.Traffic;

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
        DispatchOptions weights,
        TrafficFootprintOptions? footprint = null,
        bool returningToPark = false)
    {
        var reasons = new List<string>();
        var notes = new List<string>();
        AddCapacityReasons(robot, query, footprint, reasons, notes);
        if (!robot.IsEnabled) reasons.Add(DispatchReasons.Disabled);
        if (!robot.IsOnline) reasons.Add(DispatchReasons.Offline);
        if (robot.Status == RobotStatus.MAINTENANCE) reasons.Add(DispatchReasons.InMaintenance);
        // FL-08: busy only with its own way to parking (RESERVED / EXECUTING that NAVIGATE): the Job takes it over.
        else if (robot.IsOnline && robot.Status != RobotStatus.AVAILABLE
                 && !(returningToPark && robot.Status is RobotStatus.RESERVED or RobotStatus.EXECUTING)) reasons.Add(DispatchReasons.NotAvailable);
        if (returningToPark) notes.Add("returning_to_park: stops for this Job");
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
            robot.IsOnline)
        {
            Notes = notes
        };
    }

    /// <summary>
    /// FL-03. Missing figures do not refuse a robot, because then nothing could run until everything is measured; the
    /// decision records that it was not checked. Traffic reserves one footprint for every robot, so a robot smaller than
    /// it is safe (it just reserves more than it needs) and a larger one is not.
    /// </summary>
    private static void AddCapacityReasons(Robot robot, DispatchQuery query, TrafficFootprintOptions? footprint, List<string> reasons, List<string> notes)
    {
        if (footprint is not null
            && ((robot.LengthM is { } length && length > footprint.LengthMeters) || (robot.WidthM is { } width && width > footprint.WidthMeters)))
        {
            reasons.Add(DispatchReasons.LargerThanTrafficFootprint);
        }

        if (query.ContainerCount is not { } count)
        {
            return;
        }

        if (robot.MaxContainers is { } limit)
        {
            if (count > limit) reasons.Add(DispatchReasons.ContainerLimitExceeded);
        }
        else
        {
            notes.Add(DispatchReasons.CapacityUnknown);
        }

        if (query.TotalWeightKg is { } weight && robot.MaxPayloadKg is { } payload)
        {
            if (weight > payload) reasons.Add(DispatchReasons.PayloadExceeded);
        }
        else if (!notes.Contains(DispatchReasons.CapacityUnknown))
        {
            notes.Add(DispatchReasons.CapacityUnknown);
        }
    }

    /// <summary>Eligible robots first, best score first; then the rest, by code.</summary>
    public static IReadOnlyList<DispatchCandidate> Rank(IEnumerable<DispatchCandidate> candidates) =>
        candidates
            .OrderByDescending(c => c.Eligible)
            .ThenBy(c => c.Eligible ? c.Score : double.MaxValue)
            .ThenBy(c => c.RobotCode, StringComparer.Ordinal)
            .ToList();
}
