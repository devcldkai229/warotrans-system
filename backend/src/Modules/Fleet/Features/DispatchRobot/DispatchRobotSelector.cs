using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.DispatchRobot;

/// <summary>
/// Pure dispatch selection: prefers highest-battery AVAILABLE + enabled robots (unknown battery last).
/// The battery gate itself is <see cref="Battery.BatteryDispatchPolicy"/>.
/// </summary>
public static class DispatchRobotSelector
{
    public static Robot? Select(IEnumerable<Robot> candidates)
    {
        return candidates
            .Where(r => r.IsEnabled && r.IsOnline && r.Status == RobotStatus.AVAILABLE)
            .OrderBy(r => r.BatteryPercent is null)
            .ThenByDescending(r => r.BatteryPercent)
            .ThenBy(r => r.Code, StringComparer.Ordinal)
            .FirstOrDefault();
    }
}
