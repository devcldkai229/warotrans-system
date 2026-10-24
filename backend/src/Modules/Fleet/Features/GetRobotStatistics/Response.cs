namespace WaroTrans.Fleet.Features.GetRobotStatistics;

/// <summary>
/// Fleet numbers for the admin dashboard. The robot counts are a snapshot of right now; the assignment outcomes and the
/// per-robot job counts cover assignments that ended inside the window.
/// </summary>
public sealed record RobotStatisticsResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    int Total,
    int Enabled,
    int Online,
    int LowBattery,
    double? AverageBatteryPercent,
    IReadOnlyList<RobotStatusCount> ByStatus,
    AssignmentOutcomes Assignments,
    IReadOnlyList<RobotStatisticsRow> Robots);

public sealed record RobotStatusCount(string Status, int Count);

/// <summary>How the assignments that ended in the window ended. Everything but Completed is an interruption.</summary>
public sealed record AssignmentOutcomes(
    int Completed,
    int Reassigned,
    int AckTimeouts,
    int RobotOffline,
    int RobotRejected,
    int Cancelled,
    int Failed);

public sealed record RobotStatisticsRow(
    Guid Id,
    string Code,
    string Name,
    string Status,
    bool IsEnabled,
    bool IsOnline,
    decimal BatteryPercent,
    int JobsCompleted,
    int Interrupted);
