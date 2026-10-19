using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.DispatchRobot;

/// <summary>
/// Pure dispatch selection: prefers highest-battery AVAILABLE + enabled robots.
/// </summary>
public static class DispatchRobotSelector
{
    public static Robot? Select(IEnumerable<Robot> candidates)
    {
        return candidates
            .Where(r => r.IsEnabled && r.IsOnline && r.Status == RobotStatus.AVAILABLE)
            // Null battery (no sensor) sorts last among otherwise equal candidates.
            .OrderByDescending(r => r.BatteryPercent.HasValue)
            .ThenByDescending(r => r.BatteryPercent)
            .ThenBy(r => r.Code, StringComparer.Ordinal)
            .FirstOrDefault();
    }
}
