using System.Collections.Immutable;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Traffic;
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

    /// <summary>
    /// A robot waiting for its goal this far from the other robot's way (path, or body) may stay where it is. On a
    /// straight lane the path reserves a 0.25 m half-width band, a standing robot its footprint disc + margin (~0.29 m),
    /// both rounded out to 0.10 m cells: from ~0.65 m on they share no cell.
    /// </summary>
    public const double OffWayMeters = 0.65;

    /// <summary>
    /// A QUEUE endpoint is placed by the map author next to the goal it serves: it only has to keep this far from the
    /// goal (not <see cref="GoalPullOutRadiusMeters"/>) and <see cref="OffWayMeters"/> from the other robot's path.
    /// </summary>
    public const double QueueGoalClearanceMeters = 0.6;

    /// <summary>A queue point serves the goals within this distance (Queue B serves EP-INBOUND 0.74 m away).</summary>
    public const double QueueServesGoalMeters = 1.5;

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
        // Already standing on its goal: nothing to queue for, its stop starts right here. Queued behind a robot that waits
        // for this very spot, it held the spot and the other waited for it to leave, for ever (sim 2026-11-23, V017:
        // R1 idle on EP-INBOUND got the next pickup there while R2 waited at Queue B to drop off at EP-INBOUND).
        if (await fleet.GetRobotAsync(robotId, cancellationToken) is { } me
            && Dist(me.PoseX, me.PoseY, goal.X, goal.Y) <= Math.Max(GoalOccupiedRadiusMeters, goal.PositionTolerance))
        {
            return null;
        }

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
    /// Where a robot waits for its goal: null = where it stands. "In the way" is the traffic test itself: the cells and
    /// zones its body takes standing there (<see cref="SemanticReservation.StandingCells"/>, the endpoint's heading)
    /// against what the other robot still needs (the rest of its planned path, else its straight way to the goal, and
    /// its own body). In this order:
    /// <list type="number">
    /// <item>where it stands, when that is out of the other robot's way and not a no-stop zone (2026-11-22: a robot at
    /// the end of the shelf B lane drove to a far queue point although nobody needed its spot);</item>
    /// <item>the free queue point (type QUEUE) nearest to the goal, out of the way (INBOUND waits at the queue point next
    /// to INBOUND, not at one across the floor);</item>
    /// <item>a parking place / wait point, then any free endpoint, out of the way and close by
    /// (<see cref="LentEndpointMaxMeters"/>): waiting must not turn into a trip across the floor;</item>
    /// <item>else where it stands: traffic keeps the two apart and a lock is broken by the deadlock retreat.</item>
    /// </list>
    /// </summary>
    private async Task<EndpointPoseSnapshot?> GoalWaitPlaceAsync(
        Job job, RobotSnapshot robot, EndpointPoseSnapshot goal, Guid? otherRobotId, SemanticTrafficPolicy policy,
        CancellationToken cancellationToken)
    {
        var other = otherRobotId is { } oid ? await fleet.GetRobotAsync(oid, cancellationToken) : null;
        var codes = WaitPointCodes();
        var endpoints = await navigation.GetEndpointsOnMapAsync(job.MapVersionId, cancellationToken);
        var margin = Math.Max(0, trafficOptions?.Value.LocalizationMarginMeters ?? 0.05);
        var otherWay = await OtherWayResourcesAsync(policy, other, goal, margin, cancellationToken);
        bool OffWay(double x, double y, double? yaw) => !StandingResources(policy, x, y, yaw, margin).Overlaps(otherWay);
        var stopRadius = Math.Min(policy.FootprintHalfLength, policy.FootprintHalfWidth);
        bool MayStop(double x, double y) =>
            policy.NoStopZones.IsDefaultOrEmpty || !policy.NoStopZones.Any(z => SemanticReservation.DiscHitsZone(x, y, stopRadius, z.Ring));

        // 1. Where it stands.
        if (Dist(robot.PoseX, robot.PoseY, goal.X, goal.Y) >= QueueGoalClearanceMeters
            && MayStop(robot.PoseX, robot.PoseY) && OffWay(robot.PoseX, robot.PoseY, robot.PoseYaw))
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
            .Select(s => new { s.TargetEndpointId, s.OutputValues })
            .ToListAsync(cancellationToken);
        foreach (var h in headed)
        {
            targets.Add(h.TargetEndpointId!.Value);
            // Another robot waiting at (or driving to) a wait point holds it.
            if (h.OutputValues.TryGetValue(AreaQueueLegKey, out var leg) && leg.ValueKind == JsonValueKind.String
                && endpoints.FirstOrDefault(e => e.Code == leg.GetString()) is { } legEndpoint)
            {
                targets.Add(legEndpoint.Id);
            }
        }

        bool Free(EndpointPoseWithType e) =>
            e.IsEnabled && e.EndpointType != EndpointType.CHARGER && e.Id != goal.Id && !targets.Contains(e.Id)
            && robots.All(r => Dist(e.X, e.Y, r.PoseX, r.PoseY) > Math.Max(GoalOccupiedRadiusMeters, e.PositionTolerance));
        bool Fits(EndpointPoseWithType e) =>
            Dist(e.X, e.Y, goal.X, goal.Y) >= QueueGoalClearanceMeters && MayStop(e.X, e.Y) && OffWay(e.X, e.Y, e.Yaw);

        // 2. The queue point nearest to the goal, if it serves that goal (close to it): a queue point across the floor is
        // no place to wait for a shelf (sim 2026-11-23: a drop-off at EP-SHELF-C-1 waited at Queue B next to INBOUND).
        var place = endpoints
            .Where(e => e.EndpointType == EndpointType.QUEUE && Free(e) && Fits(e)
                        && Dist(e.X, e.Y, goal.X, goal.Y) <= QueueServesGoalMeters)
            .OrderBy(e => Dist(e.X, e.Y, goal.X, goal.Y))
            .FirstOrDefault();
        // 3. Close by: a parking place / wait point. Never a working endpoint (an INBOUND gate, a shelf): another trip
        // may need it any moment, and waiting there blocked it (sim 2026-11-23: a robot waited at EP-INBOUND).
        place ??= endpoints
            .Where(e => e.EndpointType != EndpointType.QUEUE && WaitPoints.IsStandAside(e, codes) && Free(e) && Fits(e)
                        && Dist(e.X, e.Y, robot.PoseX, robot.PoseY) <= LentEndpointMaxMeters)
            .OrderBy(e => Dist(robot.PoseX, robot.PoseY, e.X, e.Y))
            .FirstOrDefault();

        if (place is not null)
        {
            return await navigation.GetEndpointPoseAsync(place.Id, cancellationToken);
        }

        // 4. In its way and no endpoint fits: step aside to free floor close by. A robot waiting at Queue B for EP-INBOUND
        // (MAP-ONE-V015) stood on the only way out of the INBOUND dead end; the robot at INBOUND waited for its cells
        // and it waited for INBOUND: no traffic cycle, so no deadlock retreat ever freed them (sim, 2026-11-23).
        if (other is not null
            && await YieldSpotAsync(robot, other, goal, robots, cancellationToken, maxRadius: GoalYieldSpotMaxMeters) is { } spot)
        {
            return new EndpointPoseSnapshot(Guid.Empty, job.MapVersionId,
                FormattableString.Invariant($"spot ({spot.X:F2}, {spot.Y:F2})"), spot.X, spot.Y, spot.Yaw, true, RetreatArrivalToleranceMeters);
        }

        return null;
    }

    /// <summary>How far a robot waiting for its goal looks for free floor to step aside to (out of a dead end).</summary>
    public const double GoalYieldSpotMaxMeters = 2.0;

    /// <summary>Cells and zones a robot standing at (x, y) takes (the traffic's own rule, see TrafficState.ResourcesUnder).</summary>
    private static HashSet<string> StandingResources(SemanticTrafficPolicy policy, double x, double y, double? yaw, double margin)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.StandingCells(policy, x, y, yaw, margin, set);
        var zoneRadius = Math.Max(policy.FootprintHalfLength, policy.FootprintHalfWidth);
        foreach (var z in policy.SingleOccupancyZones.Where(z => SemanticReservation.DiscHitsZone(x, y, zoneRadius, z.Ring)))
        {
            set.Add($"zone:{z.Code}");
        }

        return set;
    }

    /// <summary>
    /// What the other robot still needs: the rest of its planned path (or, before it planned, its straight way to the
    /// goal) and its body at any heading. Empty without another robot.
    /// </summary>
    private async Task<HashSet<string>> OtherWayResourcesAsync(
        SemanticTrafficPolicy policy, RobotSnapshot? other, EndpointPoseSnapshot goal, double margin, CancellationToken cancellationToken)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        if (other is null)
        {
            return set;
        }

        var path = await ProposedPosesAsync(other.Id, cancellationToken);
        if (path.IsDefaultOrEmpty && Dist(other.PoseX, other.PoseY, goal.X, goal.Y) > GoalOccupiedRadiusMeters)
        {
            var heading = Math.Atan2(goal.Y - other.PoseY, goal.X - other.PoseX);
            var n = Math.Max(1, (int)Math.Ceiling(Dist(other.PoseX, other.PoseY, goal.X, goal.Y) / 0.05));
            path = Enumerable.Range(0, n + 1)
                .Select(i => new SemanticPlanPose(
                    other.PoseX + (goal.X - other.PoseX) * i / n, other.PoseY + (goal.Y - other.PoseY) * i / n,
                    i == n ? goal.Yaw : heading))
                .ToImmutableArray();
        }

        set.UnionWith(SemanticReservation.WholePathResources(policy, path));
        SemanticReservation.StandingCells(policy, other.PoseX, other.PoseY, null, margin, set);
        return set;
    }

    /// <summary>
    /// A robot that backed off from a wait-for cycle and stands at its retreat point: why it still waits there (the
    /// other robot's MOVE is not over yet), or null when it may drive on.
    /// </summary>
    private async Task<string?> RetreatHoldReasonAsync(JobStep step, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (!step.OutputValues.TryGetValue(RetreatFromStepKey, out var fromStep) || fromStep.ValueKind != JsonValueKind.String
            || step.OutputValues.ContainsKey(RetreatToKey) || step.OutputValues.ContainsKey(RetreatToPoseKey)
            || step.OutputValues.ContainsKey(RobotCommandIdKey))
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

    /// <summary>
    /// A free spot close by (<see cref="YieldSpotMaxMeters"/>) where this robot stands out of the other robot's way:
    /// none of the cells and zones the other one still needs, nor any another robot holds. Null without a semantic map
    /// bundle or when nothing close by is free.
    /// </summary>
    private async Task<(double X, double Y, double Yaw)?> YieldSpotAsync(
        RobotSnapshot robot, RobotSnapshot winner, EndpointPoseSnapshot? winnerGoal, IReadOnlyList<RobotSnapshot> others,
        CancellationToken cancellationToken, double maxRadius = YieldSpotMaxMeters)
    {
        var mapDir = trafficOptions?.Value.SemanticMapDirectory?.Trim() ?? "";
        if (segmentedTraffic is null || string.IsNullOrWhiteSpace(mapDir) || !Directory.Exists(mapDir)
            || SemanticReservation.TryReadManifestMapVersionId(mapDir) != robot.CurrentMapVersionId
            || SemanticReservation.TryLoadFromDirectory(mapDir, robot.CurrentMapVersionId, "") is not { } loaded
            || FreeFloorGrid.TryLoad(mapDir) is not { } grid)
        {
            return null;
        }

        var policy = trafficOptions!.Value.ApplySemanticOverrides(loaded);
        var margin = Math.Max(0, trafficOptions.Value.LocalizationMarginMeters);
        var goal = winnerGoal ?? new EndpointPoseSnapshot(Guid.Empty, robot.CurrentMapVersionId, "", winner.PoseX, winner.PoseY, winner.PoseYaw, true);
        var avoid = await OtherWayResourcesAsync(policy, winner, goal, margin, cancellationToken);
        var snapshot = await segmentedTraffic.GetTrafficSnapshotAsync(cancellationToken);
        foreach (var r in snapshot.Robots.Where(r => r.RobotId != robot.Id))
        {
            avoid.UnionWith(r.OccupiedResourceIds);
        }

        var positions = others.Where(o => o.Id != winner.Id).Select(o => (o.PoseX, o.PoseY))
            .Append((winner.PoseX, winner.PoseY)).ToList();
        return YieldSpots.Find(policy, grid, robot.PoseX, robot.PoseY, avoid, positions, margin, maxRadius: maxRadius);
    }

    /// <summary>A robot's proposed traffic path ahead of its pose, with headings; empty when none is known.</summary>
    private async Task<ImmutableArray<SemanticPlanPose>> ProposedPosesAsync(Guid robotId, CancellationToken cancellationToken)
    {
        if (segmentedTraffic is null)
        {
            return [];
        }

        var view = (await segmentedTraffic.GetTrafficSnapshotAsync(cancellationToken)).Robots.FirstOrDefault(r => r.RobotId == robotId);
        return view is null || view.ProposedPath.IsDefaultOrEmpty ? [] : view.ProposedPath;
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

    private async Task LogGoalQueueAsync(Job job, Guid robotId, string stepKey, EndpointPoseSnapshot goal, string busy,
        EndpointPoseSnapshot? waitAt, CancellationToken cancellationToken)
    {
        var where = waitAt is null ? "where it stands" : $"at {waitAt.Code}";
        logger.LogInformation("Job {JobNo} {StepKey}: goal {Goal} is taken ({Busy}); robot waits {Where}",
            job.JobNo, stepKey, goal.Code, busy, where);
        await RecordTrafficDecisionAsync(robotId, "goal-wait",
            $"job={job.JobNo}:goal={goal.Code}:busy={busy}:waits={(waitAt?.Code ?? "in-place")}", cancellationToken);
    }

    /// <summary>Evidence of a movement decision taken here (traffic records it; a failure never stops the Job).</summary>
    private async Task RecordTrafficDecisionAsync(Guid robotId, string code, string detail, CancellationToken cancellationToken)
    {
        if (segmentedTraffic is null)
        {
            return;
        }

        try
        {
            await segmentedTraffic.RecordDecisionAsync(robotId, code, detail, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogDebug(ex, "Traffic decision {Code} for robot {Robot} not recorded", code, robotId);
        }
    }
}
