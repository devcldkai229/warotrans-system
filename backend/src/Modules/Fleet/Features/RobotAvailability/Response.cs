namespace WaroTrans.Fleet.Features.RobotAvailability;

/// <summary>
/// FE-20: how much of <c>[From, MeasuredUntil)</c> each robot could take work, replayed from its state history.
/// <c>MeasuredUntil</c> is <c>To</c>, or now when the window reaches into the future. History is kept for a limited
/// time (<c>HistoryKeptSince</c>), and a robot registered inside the window is measured from its registration, so each
/// row says how much of the window it covers instead of guessing the rest. Percentages are of the covered time.
/// </summary>
public sealed record RobotAvailabilityResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    DateTimeOffset MeasuredUntil,
    DateTimeOffset HistoryKeptSince,
    RobotAvailabilityFigures Fleet,
    IReadOnlyList<RobotAvailabilityRow> Robots);

/// <param name="PeriodSeconds">The length of the window that has already happened.</param>
/// <param name="CoveredSeconds">The part of it the history can tell about.</param>
/// <param name="AvailablePercent">Online and not in maintenance or error.</param>
/// <param name="BusyPercent">Reserved for, running or pausing a Job.</param>
public sealed record RobotAvailabilityFigures(
    double PeriodSeconds,
    double CoveredSeconds,
    double? CoveragePercent,
    double? OnlinePercent,
    double? AvailablePercent,
    double? BusyPercent,
    IReadOnlyList<RobotStatusTime> ByStatus);

/// <summary>The fleet figures are the sum over robots that are enabled now; every robot still has its own row.</summary>
public sealed record RobotAvailabilityRow(
    Guid Id,
    string Code,
    string Name,
    bool IsEnabled,
    DateTimeOffset? MeasuredFrom,
    RobotAvailabilityFigures Figures);

/// <summary>Time in one status, as the console shows it: a robot that is not connected is OFFLINE.</summary>
public sealed record RobotStatusTime(string Status, double Seconds, double? Percent);
