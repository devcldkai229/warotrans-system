namespace WaroTrans.BuildingBlocks;

/// <summary>
/// How many Containers a robot carries at once. A robot does not count what is on it, so the system enforces this:
/// trips are planned to it, dispatch refuses a robot that cannot take the trip, and a pickup that would go over it is
/// refused.
/// </summary>
public static class RobotLoad
{
    /// <summary>The hard cap for every robot, whatever its own capacity says.</summary>
    public const int MaxContainers = 3;

    /// <summary>What one robot carries: its own capacity when set, never above <see cref="MaxContainers"/>.</summary>
    public static int EffectiveMaxContainers(int? robotMaxContainers) =>
        Math.Min(robotMaxContainers is > 0 ? robotMaxContainers.Value : MaxContainers, MaxContainers);
}
