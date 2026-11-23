using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.RobotCare;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// Picks a free Endpoint for a robot out of a list (every PARK, every CHARGER, or the members of an EndpointGroup). Free =
/// enabled, no other robot standing on it, no other robot driving to it on its own (FL-08) and no other live Job headed
/// there (a robot-care Job's chosen place, or a MOVE that already targets it).
/// </summary>
public sealed class FreeEndpointSelector(
    WorkflowExecutionDbContext db,
    IFleetModule fleet,
    IOptions<FleetIdleOptions> idle)
{
    /// <summary>Configured extra wait points (FleetIdle:FallbackEndpointCodes), see <see cref="WaitPoints"/>.</summary>
    public string? FallbackEndpointCodes => idle.Value.FallbackEndpointCodes;

    /// <summary>Goal → its queue point (FleetIdle:GoalQueueEndpoints).</summary>
    public IReadOnlyDictionary<string, string> GoalQueues => idle.Value.GoalQueues();

    /// <summary>Goal → the box robots take in turn (FleetIdle:GoalCorridors).</summary>
    public IReadOnlyDictionary<string, (double MinX, double MinY, double MaxX, double MaxY)> GoalCorridors => idle.Value.Corridors();

    private static readonly JobStatus[] Live =
        [JobStatus.CREATED, JobStatus.QUEUED, JobStatus.ASSIGNED, JobStatus.RUNNING, JobStatus.PAUSED, JobStatus.REASSIGNING, JobStatus.RECOVERY_REQUIRED];

    private static readonly JobStepStatus[] Moving = [JobStepStatus.WAITING, JobStepStatus.EXECUTING];

    public async Task<Guid?> ChooseAsync(
        RobotSnapshot robot,
        IReadOnlyList<EndpointPoseWithType> candidates,
        EndpointSelectionPolicy policy,
        Guid? exceptJobId,
        CancellationToken cancellationToken)
    {
        if (candidates.Count == 0)
        {
            return null;
        }

        var others = (await fleet.GetDispatchCandidatesAsync(robot.CurrentMapVersionId, cancellationToken))
            .Concat((await fleet.GetIdleRobotsAsync(cancellationToken)).Select(i => i.Robot))
            .Where(r => r.Id != robot.Id && r.CurrentMapVersionId == robot.CurrentMapVersionId)
            .Select(r => (r.PoseX, r.PoseY))
            .ToList();

        var taken = (await fleet.GetPositioningTargetsAsync(robot.CurrentMapVersionId, cancellationToken)).ToHashSet();

        // A robot-care Job carries its place in a context value (parkEndpointId, chargerEndpointId, …).
        var careJobs = await db.Jobs.AsNoTracking()
            .Where(j => j.ProvisioningKey.StartsWith("robot-care:") && Live.Contains(j.Status) && j.Id != exceptJobId)
            .Select(j => j.ContextValues)
            .ToListAsync(cancellationToken);
        foreach (var values in careJobs)
        {
            foreach (var (key, value) in values)
            {
                if (key.EndsWith("EndpointId", StringComparison.OrdinalIgnoreCase)
                    && value.ValueKind == JsonValueKind.String && value.TryGetGuid(out var id))
                {
                    taken.Add(id);
                }
            }
        }

        // A MOVE of another live Job already on its way there.
        var moving = await (
                from step in db.JobSteps.AsNoTracking()
                join task in db.JobTasks.AsNoTracking() on step.JobTaskId equals task.Id
                join job in db.Jobs.AsNoTracking() on task.JobId equals job.Id
                where step.StepType == StepType.MOVE && step.TargetEndpointId != null && Moving.Contains(step.Status)
                      && Live.Contains(job.Status) && job.Id != exceptJobId
                select step.TargetEndpointId!.Value)
            .ToListAsync(cancellationToken);
        taken.UnionWith(moving);

        return Pick((robot.PoseX, robot.PoseY), candidates, policy, taken, others, idle.Value.OccupiedRadiusMeters);
    }

    /// <summary>The choice itself, without the database: NEAREST by straight-line distance, FIRST_AVAILABLE in list order.</summary>
    public static Guid? Pick(
        (double X, double Y) robot,
        IReadOnlyList<EndpointPoseWithType> candidates,
        EndpointSelectionPolicy policy,
        IReadOnlySet<Guid> taken,
        IReadOnlyList<(double X, double Y)> otherRobots,
        double occupiedRadius)
    {
        var free = candidates
            .Where(e => e.IsEnabled && !taken.Contains(e.Id)
                        && !otherRobots.Any(o => Distance(o, e) <= Math.Max(e.PositionTolerance, occupiedRadius)));
        var ordered = policy == EndpointSelectionPolicy.NEAREST ? free.OrderBy(e => Distance(robot, e)) : free;
        return ordered.Select(e => (Guid?)e.Id).FirstOrDefault();
    }

    private static double Distance((double X, double Y) from, EndpointPoseWithType to) =>
        Math.Sqrt(Math.Pow(from.X - to.X, 2) + Math.Pow(from.Y - to.Y, 2));
}
