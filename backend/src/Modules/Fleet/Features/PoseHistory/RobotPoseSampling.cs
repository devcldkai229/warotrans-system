namespace WaroTrans.Fleet.Features.PoseHistory;

/// <summary>A pose as the decision needs it.</summary>
public readonly record struct PoseReading(
    double X,
    double Y,
    double Yaw,
    double? LinearVelocity,
    double? AngularVelocity,
    string? MapVersionCode,
    DateTimeOffset At)
{
    /// <summary>Below these the robot counts as standing still (m/s, rad/s).</summary>
    private const double StillLinear = 0.01;
    private const double StillAngular = 0.02;

    public bool IsMoving =>
        Math.Abs(LinearVelocity ?? 0) > StillLinear || Math.Abs(AngularVelocity ?? 0) > StillAngular;
}

/// <summary>
/// FE-09: which telemetry poses become movement history. Telemetry comes several times a second; keeping all of it
/// would store hundreds of thousands of rows a day per robot, so a point is kept when the robot moved or turned far
/// enough, when it has been moving for a while without one, and where it stops. A robot standing still adds nothing.
/// </summary>
public static class RobotPoseSampling
{
    /// <summary>Closer than this to the last point, a stop is not worth a point of its own.</summary>
    private const double StopEpsilonMeters = 0.02;

    /// <param name="last">The last point kept for this robot, or null.</param>
    /// <param name="wasMoving">Whether the previous reading (kept or not) was moving.</param>
    public static bool ShouldKeep(PoseReading? last, bool wasMoving, PoseReading current, RobotHistoryOptions options)
    {
        if (last is not { } previous)
        {
            return true;
        }

        if (!string.Equals(previous.MapVersionCode, current.MapVersionCode, StringComparison.Ordinal))
        {
            return true;
        }

        var distance = Math.Sqrt(Math.Pow(current.X - previous.X, 2) + Math.Pow(current.Y - previous.Y, 2));
        if (distance >= options.MinDistanceMeters)
        {
            return true;
        }

        if (Math.Abs(HeadingChange(previous.Yaw, current.Yaw)) >= options.MinHeadingChangeRad)
        {
            return true;
        }

        if (current.IsMoving)
        {
            return (current.At - previous.At).TotalSeconds >= options.MaxIntervalSeconds;
        }

        // Just stopped: keep where it stopped, unless that is where the last point already is.
        return wasMoving && distance > StopEpsilonMeters;
    }

    /// <summary>The smallest signed turn from one heading to another, in (−π, π].</summary>
    public static double HeadingChange(double from, double to)
    {
        var change = (to - from) % (2 * Math.PI);
        if (change > Math.PI) change -= 2 * Math.PI;
        if (change <= -Math.PI) change += 2 * Math.PI;
        return change;
    }
}
