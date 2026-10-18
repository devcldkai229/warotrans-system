using Microsoft.EntityFrameworkCore;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Features.DispatchRobot;
using WaroTrans.Fleet.Features.IssueNavigateCommand;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Services;

public sealed class FleetModuleApi(
    FleetDbContext db,
    IssueNavigateCommandHandler issueNavigateCommandHandler) : IFleetModule
{
    public async Task<RobotSnapshot?> GetRobotAsync(Guid robotId, CancellationToken cancellationToken = default)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken);
        return robot is null ? null : ToSnapshot(robot);
    }

    public async Task<IReadOnlyList<RobotSnapshot>> GetDispatchCandidatesAsync(
        Guid mapVersionId,
        CancellationToken cancellationToken = default)
    {
        var robots = await db.Robots
            .AsNoTracking()
            .Where(r => r.CurrentMapVersionId == mapVersionId)
            .ToListAsync(cancellationToken);

        // Same ordering rule as DispatchRobotSelector (highest battery, then code).
        var candidates = new List<RobotSnapshot>();
        var remaining = robots.ToList();
        while (DispatchRobotSelector.Select(remaining) is { } best)
        {
            candidates.Add(ToSnapshot(best));
            remaining.Remove(best);
        }

        return candidates;
    }

    public async Task<Guid> NavigateAsync(
        Guid robotId,
        double x,
        double y,
        double yaw,
        Guid jobId,
        Guid jobStepId,
        CancellationToken cancellationToken = default)
    {
        // JobId without JobAssignmentId: Fleet records one assignment per navigate command
        // (ended by its RESULT). The Job keeps its robot in WorkflowExecution (assignedRobotId).
        // The handler retries the telemetry/command race on the robot row itself.
        var response = await issueNavigateCommandHandler.HandleAsync(
            robotId,
            new IssueNavigateCommandRequest(x, y, yaw, "map", jobId, null, jobStepId),
            cancellationToken);
        return response.CommandId;
    }

    private static RobotSnapshot ToSnapshot(Robot r) => new(
        r.Id,
        r.Code,
        r.WarehouseId,
        r.CurrentMapVersionId,
        r.Status,
        r.IsEnabled,
        r.IsOnline,
        r.LocalizationStatus,
        r.NavigationStatus,
        r.BatteryPercent,
        r.LastTelemetryAt,
        r.PoseX,
        r.PoseY,
        r.PoseYaw);
}
