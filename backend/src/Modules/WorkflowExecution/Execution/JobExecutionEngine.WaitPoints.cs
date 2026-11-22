using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>
/// Where robots wait when they cannot go on: at a wait point (= queue point = recovery point, <see cref="WaitPoints"/>)
/// or a parking place, never in the way of the robot they wait for.
/// <list type="bullet">
/// <item>Goal queue: a MOVE whose endpoint another robot with work stands on, pulls out of, or is already driving to
/// waits (first come, first served) instead of driving up behind it. A robot standing at a parking place or wait point
/// waits there; otherwise it drives to the free wait point that costs it the least detour and is clear of the other robot.
/// On a dead-end bay (MAP-ONE INBOUND) driving up behind meant blocking the only way out: both robots locked.</item>
/// <item>Deadlock retreat: the robot that backed off waits until the other robot's MOVE is over (at most
/// <see cref="RetreatMaxHoldSeconds"/>), not a fixed few seconds: coming back early locked the pair again.</item>
/// </list>
/// </summary>
public sealed partial class JobExecutionEngine
{
    /// <summary>Pseudo area of a MOVE waiting for its goal endpoint: <c>GOAL:EP-…</c>.</summary>
    public const string GoalQueuePrefix = "GOAL:";

    /// <summary>MOVE output of a goal-queue wait: the robot standing on (or leaving) the goal. RobotCareService moves it
    /// away when it is idle.</summary>
    public const string GoalBlockerKey = "goalBlockedByRobotId";

    /// <summary>MOVE output of a deadlock retreat: the other robot's MOVE it gave way to.</summary>
    public const string RetreatFromStepKey = "retreatFromStepId";

    /// <summary>MOVE output of a deadlock retreat: the robot it gave way to.</summary>
    public const string RetreatFromRobotKey = "retreatFromRobotId";

    /// <summary>A robot that backed off waits for the other robot's MOVE to end, but no longer than this.</summary>
    public const double RetreatMaxHoldSeconds = 90;

    /// <summary>A robot this close to an endpoint stands on it.</summary>
    public const double GoalOccupiedRadiusMeters = 0.30;

    /// <summary>A robot that was at the endpoint and is still this close is still pulling out of it.</summary>
    public const double GoalPullOutRadiusMeters = 1.0;

    /// <summary>A place to wait at keeps at least this far from the other robot and from its way to the goal.</summary>
    public const double WaitClearanceMeters = 0.6;

    /// <summary>
    /// A robot standing this far from another robot's planned path does not block it: the path reserves the body at any
    /// heading plus the path tolerance (~0.36 m), a standing robot its footprint plus margin (~0.30 m), rounded out to
    /// 0.10 m cells. At 0.6 m a robot at MAP-ONE EP-PARKING-A still blocked the turn into shelf row A.
    /// </summary>
    public const double PathClearanceMeters = 0.8;

    /// <summary>A robot waiting for its goal this far from the other robot's way (path, or body) may stay where it is.</summary>
    public const double OffWayMeters = 0.5;

    private static string GoalZone(string endpointCode) => GoalQueuePrefix + endpointCode;

    private IReadOnlyList<string> WaitPointCodes() =>
        WaitPoints.ConfiguredCodes(freeEndpoints?.FallbackEndpointCodes, trafficOptions?.Value.DeadlockRetreatEndpointCodes);

    private static double Dist(double ax, double ay, double bx, double by) => Math.Sqrt(Math.Pow(ax - bx, 2) + Math.Pow(ay - by, 2));

    /// <summary>
    /// Why this MOVE may not drive to <paramref name="goal"/> yet, and the robot it waits for; null when it may go.
    /// Busy: an earlier waiter for the same goal, another Job's MOVE already driving there, a robot with work standing on
    /// it or still pulling out of it, and an idle robot standing on it or driving away from it (RobotCareService moves an
    /// idle one away: on a dead-end bay such as MAP-ONE OUTBOUND, driving up behind it left it no way out). A robot that
    /// itself waits for a goal does not count (two robots each waiting for the other's place would wait forever;
    /// traffic and the deadlock retreat sort those out).
    /// </summary>
    private async Task<(string Reason, Guid? Robot)?> GoalBusyByAsync(
        Job job, JobStep step, Guid robotId, EndpointPoseSnapshot goal, CancellationToken cancellationToken)
    {
        var zone = GoalZone(goal.Code);
        DateTimeOffset? mySince = step.OutputValues.TryGetValue(AreaQueueZoneKey, out var mz) && mz.GetString() == zone
                                  && step.OutputValues.TryGetValue(AreaWaitSinceKey, out var ms)
            ? ms.GetDateTimeOffset()
            : null;
        var others = await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.MOVE
                        && (s.Status == JobStepStatus.EXECUTING || s.Status == JobStepStatus.WAITING)
                        && s.JobTask.JobId != job.Id
                        && s.JobTask.Job.Status == JobStatus.RUNNING)
            .Select(s => new { s.JobTask.JobId, s.JobTask.Job.JobNo, s.Status, s.TargetEndpointId, s.OutputValues, s.ResolvedInputs })
            .ToListAsync(cancellationToken);
        var goalWaiters = new HashSet<Guid>();
        foreach (var other in others)
        {
            Guid? theirRobot = other.ResolvedInputs.TryGetValue("robotId", out var r) && r.ValueKind == JsonValueKind.String ? r.GetGuid() : null;
            var theirZone = other.OutputValues.TryGetValue(AreaQueueZoneKey, out var z) && z.ValueKind == JsonValueKind.String ? z.GetString() : null;
            if (theirZone is not null && theirZone.StartsWith(GoalQueuePrefix, StringComparison.Ordinal) && theirRobot is { } w)
            {
                goalWaiters.Add(w);
            }

            if (theirZone == zone && other.OutputValues.TryGetValue(AreaWaitSinceKey, out var since))
            {
                if (mySince is null || since.GetDateTimeOffset() < mySince)
                {
                    return ($"{other.JobNo} waits for it first", theirRobot);
                }

                continue;
            }

            if (other.Status == JobStepStatus.EXECUTING && other.TargetEndpointId == goal.Id && theirZone is null)
            {
                return ($"{other.JobNo} is on its way there", theirRobot);
            }
        }

        // Robots with work at the goal: on it, or just done there and not clear of it yet.
        var busy = await db.JobRobotAssignments.AsNoTracking()
            .Where(a => a.EndedAt == null && a.RobotId != robotId && a.JobId != job.Id)
            .Select(a => new { a.RobotId, a.JobId })
            .ToListAsync(cancellationToken);
        foreach (var assignment in busy.DistinctBy(a => a.RobotId))
        {
            if (goalWaiters.Contains(assignment.RobotId)
                || await fleet.GetRobotAsync(assignment.RobotId, cancellationToken) is not { } other
                || other.LocalizationStatus != LocalizationStatus.LOCALIZED
                || other.CurrentMapVersionId != job.MapVersionId)
            {
                continue;
            }

            var d = Dist(other.PoseX, other.PoseY, goal.X, goal.Y);
            if (d <= Math.Max(GoalOccupiedRadiusMeters, goal.PositionTolerance))
            {
                return ($"{other.Code} is at it", other.Id);
            }

            if (d <= GoalPullOutRadiusMeters)
            {
                var lastStop = await db.JobSteps.AsNoTracking()
                    .Where(s => s.JobTask.JobId == assignment.JobId && s.StepType == StepType.MOVE && s.Status == JobStepStatus.COMPLETED)
                    .OrderByDescending(s => s.CompletedAt)
                    .Select(s => s.TargetEndpointId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (lastStop == goal.Id)
                {
                    return ($"{other.Code} is pulling out of it", other.Id);
                }
            }
        }

        // Robots without work: standing on the goal, or on their way off it (making way / going to park).
        var positioning = await fleet.GetPositioningRobotIdsAsync(cancellationToken);
        var withWork = busy.Select(a => a.RobotId).ToHashSet();
        var idle = (await fleet.GetDispatchCandidatesAsync(job.MapVersionId, cancellationToken))
            .Concat((await fleet.GetIdleRobotsAsync(cancellationToken)).Select(i => i.Robot))
            .Select(r => r.Id)
            .Concat(positioning)
            .Where(id => id != robotId && !withWork.Contains(id) && !goalWaiters.Contains(id))
            .Distinct();
        foreach (var id in idle)
        {
            if (await fleet.GetRobotAsync(id, cancellationToken) is not { LocalizationStatus: LocalizationStatus.LOCALIZED } other
                || other.CurrentMapVersionId != job.MapVersionId)
            {
                continue;
            }

            var d = Dist(other.PoseX, other.PoseY, goal.X, goal.Y);
            if (d <= Math.Max(GoalOccupiedRadiusMeters, goal.PositionTolerance))
            {
                return ($"{other.Code} stands on it", other.Id);
            }

            if (d <= GoalPullOutRadiusMeters && positioning.Contains(id))
            {
                return ($"{other.Code} is leaving it", other.Id);
            }
        }

        return null;
    }

    /// <summary>
    /// Where a robot waits for its goal: null = where it stands (it stands at a parking place or wait point clear of
    /// the other robot, or there is nowhere better), else the free parking place / wait point with the least detour that
    /// keeps clear of the other robot, of its way to the goal and of the goal itself.
    /// </summary>
    private async Task<EndpointPoseSnapshot?> GoalWaitPlaceAsync(
        Job job, RobotSnapshot robot, EndpointPoseSnapshot goal, Guid? otherRobotId, CancellationToken cancellationToken)
    {
        var other = otherRobotId is { } oid ? await fleet.GetRobotAsync(oid, cancellationToken) : null;
        var codes = WaitPointCodes();
        var endpoints = await navigation.GetEndpointsOnMapAsync(job.MapVersionId, cancellationToken);

        // Clear of the other robot, of the straight way to the goal and of the path it planned (where it is going next).
        var otherPath = other is null ? [] : await ProposedPathAsync(other.Id, cancellationToken);
        bool Clear(double x, double y) =>
            Dist(x, y, goal.X, goal.Y) >= GoalPullOutRadiusMeters
            && (other is null
                || (Dist(x, y, other.PoseX, other.PoseY) >= WaitClearanceMeters
                    && SegmentDistance(x, y, other.PoseX, other.PoseY, goal.X, goal.Y) >= WaitClearanceMeters
                    && otherPath.All(p => Dist(x, y, p.X, p.Y) >= PathClearanceMeters)));

        var standingAt = endpoints.FirstOrDefault(e => Dist(robot.PoseX, robot.PoseY, e.X, e.Y) <= GoalOccupiedRadiusMeters);
        if (standingAt is not null && WaitPoints.IsStandAside(standingAt, codes) && Clear(robot.PoseX, robot.PoseY))
        {
            return null;
        }

        // Off the other robot's way: its planned path (or, before it planned, its straight line to the goal) and itself.
        double FromWay(double x, double y)
        {
            if (other is null)
            {
                return double.MaxValue;
            }

            var d = Dist(x, y, other.PoseX, other.PoseY);
            return otherPath.Count > 0
                ? Math.Min(d, otherPath.Min(p => Dist(x, y, p.X, p.Y)))
                : Math.Min(d, SegmentDistance(x, y, other.PoseX, other.PoseY, goal.X, goal.Y));
        }

        // Standing on any endpoint (a shelf bay too) off its way: wait right there. It is re-checked every tick, and a
        // farther place only made the robot wander across the floor (MAP-ONE-V013, 2026-11-22: SHELF-C-1, then all the
        // way to SHELF-A-1 through ZONE-SINGLE-CENTER, while the other robot waited for it).
        if (standingAt is not null && standingAt.EndpointType != EndpointType.CHARGER && standingAt.Id != goal.Id
            && Dist(robot.PoseX, robot.PoseY, goal.X, goal.Y) >= GoalPullOutRadiusMeters
            && FromWay(robot.PoseX, robot.PoseY) >= OffWayMeters)
        {
            return null;
        }

        var robots = (await fleet.GetDispatchCandidatesAsync(job.MapVersionId, cancellationToken))
            .Concat((await fleet.GetIdleRobotsAsync(cancellationToken)).Select(i => i.Robot))
            .Where(r => r.Id != robot.Id && r.CurrentMapVersionId == job.MapVersionId)
            .ToList();
        if (other is not null)
        {
            robots.Add(other);
        }

        var targets = (await fleet.GetPositioningTargetsAsync(job.MapVersionId, cancellationToken)).ToHashSet();
        var headed = await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.MOVE && s.TargetEndpointId != null
                        && (s.Status == JobStepStatus.EXECUTING || s.Status == JobStepStatus.WAITING)
                        && s.JobTask.JobId != job.Id && s.JobTask.Job.Status == JobStatus.RUNNING)
            .Select(s => s.OutputValues)
            .ToListAsync(cancellationToken);
        foreach (var outputs in headed)
        {
            // Another robot waiting at (or driving to) a wait point holds it.
            if (outputs.TryGetValue(AreaQueueLegKey, out var leg) && leg.ValueKind == JsonValueKind.String
                && endpoints.FirstOrDefault(e => e.Code == leg.GetString()) is { } legEndpoint)
            {
                targets.Add(legEndpoint.Id);
            }
        }

        var place = endpoints
            .Where(e => WaitPoints.IsStandAside(e, codes) && e.Id != goal.Id && !targets.Contains(e.Id)
                        && robots.All(r => Dist(e.X, e.Y, r.PoseX, r.PoseY) > Math.Max(GoalOccupiedRadiusMeters, e.PositionTolerance))
                        && Clear(e.X, e.Y))
            .OrderBy(e => Dist(robot.PoseX, robot.PoseY, e.X, e.Y) + Dist(e.X, e.Y, goal.X, goal.Y))
            .FirstOrDefault();
        if (place is null && FromWay(robot.PoseX, robot.PoseY) < OffWayMeters)
        {
            // No parking place / wait point is clear, and where it stands is in the other robot's way: waiting there locks
            // both (2026-11-22: RBT-002 at EP-PARKING-B on the only corridor RBT-001 had to take to EP-INBOUND). The
            // nearest free endpoint off that way.
            place = endpoints
                .Where(e => e.IsEnabled && e.EndpointType != EndpointType.CHARGER && e.Id != goal.Id && !targets.Contains(e.Id)
                            && Dist(e.X, e.Y, robot.PoseX, robot.PoseY) > 0.3
                            && Dist(e.X, e.Y, goal.X, goal.Y) >= GoalPullOutRadiusMeters
                            && FromWay(e.X, e.Y) >= OffWayMeters
                            && robots.All(r => Dist(e.X, e.Y, r.PoseX, r.PoseY) > Math.Max(GoalOccupiedRadiusMeters, e.PositionTolerance)))
                .OrderBy(e => Dist(robot.PoseX, robot.PoseY, e.X, e.Y))
                .FirstOrDefault();
        }

        return place is null ? null : await navigation.GetEndpointPoseAsync(place.Id, cancellationToken);
    }

    /// <summary>
    /// A robot that backed off from a wait-for cycle and stands at its retreat point: why it still waits there (the
    /// other robot's MOVE is not over yet), or null when it may drive on.
    /// </summary>
    private async Task<string?> RetreatHoldReasonAsync(JobStep step, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (!step.OutputValues.TryGetValue(RetreatFromStepKey, out var fromStep) || fromStep.ValueKind != JsonValueKind.String
            || step.OutputValues.ContainsKey(RetreatToKey) || step.OutputValues.ContainsKey(RobotCommandIdKey))
        {
            return null;
        }

        var since = step.OutputValues.TryGetValue(AreaWaitSinceKey, out var s) ? s.GetDateTimeOffset() : now;
        if ((now - since).TotalSeconds >= RetreatMaxHoldSeconds)
        {
            return null;
        }

        if (fromStep.GetGuid() == Guid.Empty)
        {
            // Gave way to an idle robot making way itself: wait while it is still on that way.
            if (step.OutputValues.TryGetValue(RetreatFromRobotKey, out var idleEl) && idleEl.ValueKind == JsonValueKind.String
                && (await fleet.GetPositioningRobotIdsAsync(cancellationToken)).Contains(idleEl.GetGuid()))
            {
                var idleRobot = await fleet.GetRobotAsync(idleEl.GetGuid(), cancellationToken);
                return $"{idleRobot?.Code ?? "the other robot"} to get out of the way";
            }

            return null;
        }

        var theirs = await db.JobSteps.AsNoTracking()
            .Where(x => x.Id == fromStep.GetGuid())
            .Select(x => new { x.Status, Job = x.JobTask.Job.Status })
            .FirstOrDefaultAsync(cancellationToken);
        if (theirs is null || theirs.Job != JobStatus.RUNNING
            || theirs.Status is not (JobStepStatus.EXECUTING or JobStepStatus.WAITING or JobStepStatus.READY))
        {
            return null;
        }

        var who = step.OutputValues.TryGetValue(RetreatFromRobotKey, out var w) && w.ValueKind == JsonValueKind.String
                  && await fleet.GetRobotAsync(w.GetGuid(), cancellationToken) is { } robot
            ? robot.Code
            : "the other robot";
        return $"{who} to pass";
    }

    /// <summary>Outputs of a robot that keeps waiting at its retreat point (looks again in a second).</summary>
    private static Dictionary<string, JsonElement> RetreatHoldOutputs(
        IReadOnlyDictionary<string, JsonElement> current, string reason, DateTimeOffset now)
    {
        var outputs = new Dictionary<string, JsonElement>(current)
        {
            [WaitUntilKey] = JsonSerializer.SerializeToElement(now.AddSeconds(1)),
            ["waitingFor"] = JsonSerializer.SerializeToElement($"area_queue:{DeadlockRetreatZone} (waiting for {reason})")
        };
        outputs.Remove(AreaQueueLegKey);
        return outputs;
    }

    /// <summary>Points of a robot's proposed traffic path (what Nav2 planned), empty when none is known.</summary>
    private async Task<IReadOnlyList<(double X, double Y)>> ProposedPathAsync(Guid robotId, CancellationToken cancellationToken)
    {
        if (segmentedTraffic is null)
        {
            return [];
        }

        var view = (await segmentedTraffic.GetTrafficSnapshotAsync(cancellationToken)).Robots.FirstOrDefault(r => r.RobotId == robotId);
        return view is null || view.ProposedPath.IsDefaultOrEmpty
            ? []
            : view.ProposedPath.Select(p => (p.X, p.Y)).ToList();
    }

    /// <summary>Endpoints a MOVE of a live Job is driving to or waiting for.</summary>
    private async Task<HashSet<Guid>> LiveMoveTargetsAsync(CancellationToken cancellationToken) =>
        (await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.MOVE && s.TargetEndpointId != null
                        && (s.Status == JobStepStatus.EXECUTING || s.Status == JobStepStatus.WAITING || s.Status == JobStepStatus.READY)
                        && s.JobTask.Job.Status == JobStatus.RUNNING)
            .Select(s => s.TargetEndpointId!.Value)
            .ToListAsync(cancellationToken))
        .ToHashSet();

    private void LogGoalQueue(Job job, string stepKey, EndpointPoseSnapshot goal, string busy, EndpointPoseSnapshot? waitAt) =>
        logger.LogInformation(
            "Job {JobNo} {StepKey}: goal {Goal} is taken ({Busy}); robot waits {Where}",
            job.JobNo, stepKey, goal.Code, busy, waitAt is null ? "where it stands" : $"at {waitAt.Code}");
}
