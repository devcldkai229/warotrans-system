using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>
/// Zone-chain approach (Traffic:SemanticResourceModel = ZoneChain): a robot drives to an endpoint inside a BAY (shelf
/// bay, INBOUND, OUTBOUND) only while nobody else is in that bay, holds it, is on its way into it, or waited for it
/// first. Otherwise it waits at the bay's queue point (first free one of the zone's queueEndpointCodes), or where it
/// stands when that is a stop, and never on a corridor: the robot in the bay always has a way out, so two robots never
/// face each other in a dead end. The decision is taken again on every wake-up; the wait never runs down a timeout.
/// </summary>
public sealed partial class JobExecutionEngine
{
    /// <summary>MOVE output <c>areaQueueZone</c> of a robot waiting for a bay: <c>ZONE:ZONE-BAY-INBOUND</c>.</summary>
    public const string ZoneQueuePrefix = "ZONE:";

    /// <summary>A robot this close to a queue point stands on it.</summary>
    private const double QueueOccupiedRadiusMeters = 0.30;

    /// <summary>A waiting place closer than this to the bay robot's plan out is in its way (both bodies plus a margin).</summary>
    private const double OccupantWayClearanceMeters = 0.55;

    private sealed record ZoneApproachDecision(
        /// <summary>Where to drive now: the goal itself, a queue point, a stop slot; null = stay and wait.</summary>
        EndpointPoseSnapshot? DriveTo,
        /// <summary>Set while waiting for the bay (on the way to its queue point, or standing there).</summary>
        string? QueueZone,
        DateTimeOffset? Since,
        string Reason,
        Guid? BlockedBy);

    /// <summary>
    /// Null when the goal is not in a bay of the partition (the usual goal rules apply). Otherwise where to drive now, or
    /// that the robot waits where it is.
    /// </summary>
    private async Task<ZoneApproachDecision?> ZoneApproachAsync(
        Job job, JobStep step, RobotSnapshot robot, EndpointPoseSnapshot goal, SemanticTrafficPolicy policy,
        DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (!policy.UsesZoneChain || TrafficZones.ZoneAt(policy.TrafficZones, goal.X, goal.Y) is not { Kind: TrafficZoneKind.Bay } bay)
        {
            return null;
        }

        var zoneKey = ZoneQueuePrefix + bay.Code;
        DateTimeOffset? mySince = step.OutputValues.TryGetValue(AreaQueueZoneKey, out var mz) && mz.ValueKind == JsonValueKind.String
                                  && mz.GetString() == zoneKey
                                  && step.OutputValues.TryGetValue(AreaWaitSinceKey, out var ms)
            ? ms.GetDateTimeOffset()
            : null;

        var busy = await ZoneBusyByAsync(job, robot, bay, zoneKey, mySince, cancellationToken);
        if (busy is null)
        {
            return new ZoneApproachDecision(goal, null, null, "free", null);
        }

        var since = mySince ?? now;
        var endpoints = await navigation.GetEndpointsOnMapAsync(job.MapVersionId, cancellationToken);
        var queues = bay.QueueEndpointCodes
            .Select(code => endpoints.FirstOrDefault(e => e.Code == code && e.IsEnabled))
            .Where(e => e is not null)
            .Select(e => e!)
            .ToList();

        // The robot in the bay waits for THIS one (traffic: its way out runs through where this one stands): this spot
        // is in the way, whatever the map says. Sim V022 2026-11-24: R1 waited at EP-QUEUE-B for INBOUND, R2's way out
        // of INBOUND swept past EP-QUEUE-B, and each waited for the other. Then it moves on to another place.
        // Only a robot that is trying to leave counts: an idle one in the bay keeps a stale wait-for edge (sim V022
        // 2026-11-24: R1 was sent back and forth between EP-QUEUE-A and EP-INSPECTION 221 times for an idle R2).
        var occupantView = busy.Value.Robot is { } occupant && segmentedTraffic is not null
            ? (await segmentedTraffic.GetTrafficSnapshotAsync(cancellationToken)).Robots.FirstOrDefault(r => r.RobotId == occupant)
            : null;
        var occupantLeaving = occupantView is not null && occupantView.WaitingReason != TrafficWaitingReason.None
                              && occupantView.Phase is not (TrafficRobotPhase.Idle or TrafficRobotPhase.HoldingService or TrafficRobotPhase.Quarantined);
        // The robot in the bay wants out along this plan: a place this close to it is in its way (sim V022: R2 went back
        // and forth between EP-QUEUE-A and EP-INSPECTION, both on R1's way out of bay A, 142 times).
        var occupantPath = occupantLeaving && !occupantView!.ProposedPath.IsDefaultOrEmpty ? occupantView.ProposedPath : [];
        bool OnItsWay(double x, double y) => occupantPath.Any(p => Dist(p.X, p.Y, x, y) < OccupantWayClearanceMeters);
        var inTheWay = (occupantLeaving && occupantView!.BlockingOwner == robot.Id) || OnItsWay(robot.PoseX, robot.PoseY);
        bool StandsAt(EndpointPoseWithType e) =>
            Dist(robot.PoseX, robot.PoseY, e.X, e.Y) <= Math.Max(QueueOccupiedRadiusMeters, e.PositionTolerance);

        // Already standing at one of the bay's queue points, or at any stop slot it was sent to instead: wait there
        // (unless it is in the way out). Never drive back and forth between two waiting places.
        var slotCodesHere = policy.TrafficZones.Where(z => z.Kind == TrafficZoneKind.Slot).SelectMany(z => z.EndpointCodes)
            .ToHashSet(StringComparer.Ordinal);
        foreach (var q in queues.Concat(endpoints.Where(e => e.IsEnabled && slotCodesHere.Contains(e.Code))))
        {
            if (StandsAt(q) && !inTheWay)
            {
                return new ZoneApproachDecision(null, zoneKey, since, busy.Value.Reason, busy.Value.Robot);
            }
        }

        // The first free queue point (on its way there already, or not yet): drive there.
        foreach (var q in queues.Where(q => !StandsAt(q) && !OnItsWay(q.X, q.Y)))
        {
            if (await QueuePointFreeAsync(job, robot, q, policy, cancellationToken))
            {
                return new ZoneApproachDecision(Pose(q, job.MapVersionId), zoneKey, since, busy.Value.Reason, busy.Value.Robot);
            }
        }

        // No queue point free: where it stands, when that is a stop (a slot, or a bay it works at) out of the way out;
        // else the nearest free slot (parking, charger, inspection, another queue point).
        var here = TrafficZones.ZoneAt(policy.TrafficZones, robot.PoseX, robot.PoseY);
        if (here is { IsStop: true } && here.Code != bay.Code && !inTheWay)
        {
            return new ZoneApproachDecision(null, zoneKey, since, busy.Value.Reason, busy.Value.Robot);
        }

        var slotCodes = policy.TrafficZones.Where(z => z.Kind == TrafficZoneKind.Slot).SelectMany(z => z.EndpointCodes).ToHashSet(StringComparer.Ordinal);
        foreach (var slot in endpoints.Where(e => e.IsEnabled && slotCodes.Contains(e.Code) && !StandsAt(e) && !OnItsWay(e.X, e.Y))
                     .OrderBy(e => Dist(robot.PoseX, robot.PoseY, e.X, e.Y)))
        {
            if (await QueuePointFreeAsync(job, robot, slot, policy, cancellationToken))
            {
                if (inTheWay)
                {
                    logger.LogInformation("Robot {Robot} stands in the way out of {Bay}: it waits at {Slot} instead",
                        robot.Code, bay.Code, slot.Code);
                }

                return new ZoneApproachDecision(Pose(slot, job.MapVersionId), zoneKey, since, busy.Value.Reason, busy.Value.Robot);
            }
        }

        return new ZoneApproachDecision(null, zoneKey, since, busy.Value.Reason, busy.Value.Robot);
    }

    /// <summary>
    /// CHECK ROUTE_CLEAR. Fails (the robot stays at its stop, the check is tried again) only when something that is not
    /// a robot shuts the way with no way around: that does not go away by waiting for traffic. A busy bay or another
    /// robot on the way passes: the MOVE then waits at the bay's queue point / for traffic, which is where waiting
    /// belongs. Outputs record the cost of the way and the decision, for the operator and for the evidence trail.
    /// </summary>
    private async Task<(bool Passed, string Reason)> EvaluateRouteClearAsync(
        Job job, IReadOnlyDictionary<string, JsonElement> inputs, Dictionary<string, JsonElement> outputs,
        CancellationToken cancellationToken)
    {
        void Out(string key, object? value) => outputs[key] = JsonSerializer.SerializeToElement(value);

        var goal = await navigation.GetEndpointPoseAsync(inputs["endpointId"].GetGuid(), cancellationToken);
        Guid? robotId = inputs.TryGetValue("robotId", out var rid) && rid.ValueKind == JsonValueKind.String ? rid.GetGuid()
            : job.ContextValues.TryGetValue(AssignedRobotKey, out var aid) && aid.ValueKind == JsonValueKind.String ? aid.GetGuid()
            : null;
        var robot = robotId is { } id ? await fleet.GetRobotAsync(id, cancellationToken) : null;
        if (goal is null || robot is null)
        {
            Out("decision", "NO_ROUTE");
            return (false, goal is null ? "endpoint_not_found" : "robot_not_found");
        }

        // The bay the endpoint is in: busy means wait at its queue point (the MOVE goes there), never a failure.
        var mapDir = trafficOptions?.Value.SemanticMapDirectory?.Trim() ?? "";
        var policy = Directory.Exists(mapDir) && SemanticReservation.TryLoadFromDirectory(mapDir, job.MapVersionId, "") is { } loaded
            ? trafficOptions!.Value.ApplySemanticOverrides(loaded)
            : null;
        string? bayBusy = null;
        if (policy is { UsesZoneChain: true } && TrafficZones.ZoneAt(policy.TrafficZones, goal.X, goal.Y) is { Kind: TrafficZoneKind.Bay } bay)
        {
            Out("zone", bay.Code);
            var busy = await ZoneBusyByAsync(job, robot, bay, ZoneQueuePrefix + bay.Code, null, cancellationToken);
            bayBusy = busy?.Reason;
            Out("zoneBusy", bayBusy is not null);
        }

        // Cost of the way and what is in it: the robot's own live costmap against the map.
        var staticGrid = Directory.Exists(mapDir) ? RouteCostEvaluator.FromBundle(mapDir) : null;
        if (staticGrid is null)
        {
            Out("decision", bayBusy is null ? "PASS" : "WAIT_AT_QUEUE");
            return (true, "no map bundle to judge the way: traffic decides");
        }

        var live = liveCostmaps?.Get(robot.Code, "global") is { } sample ? RouteCostEvaluator.FromLiveCostmap(sample.Body) : null;
        var others = new List<(Guid, double, double, double)>();
        if (segmentedTraffic is not null)
        {
            var snapshot = await segmentedTraffic.GetTrafficSnapshotAsync(cancellationToken);
            var radius = policy?.FootprintRadiusMeters ?? 0.24;
            others.AddRange(snapshot.Robots
                .Where(r => r.RobotId != robot.Id && r.X is not null && r.Y is not null)
                .Select(r => (r.RobotId, r.X!.Value, r.Y!.Value, radius)));
        }

        var analysis = RouteCostEvaluator.Analyze(staticGrid, live, robot.PoseX, robot.PoseY, goal.X, goal.Y, others);
        Out("pathLengthMeters", Math.Round(analysis.LengthMeters, 2));
        Out("estimatedSeconds", Math.Round(analysis.EstimatedSeconds, 1));
        Out("narrowCells", analysis.NarrowCells);
        Out("liveCostmap", analysis.LiveCostmap);
        if (analysis.BlockingRobot is { } blocking)
        {
            Out("blockingRobotId", blocking);
        }

        var (passed, decision) = analysis.Verdict switch
        {
            RouteCostEvaluator.Verdict.BlockedByObstacle => (false, "BLOCKED_OBSTACLE"),
            RouteCostEvaluator.Verdict.NoRoute => (false, "NO_ROUTE"),
            _ when bayBusy is not null => (true, "WAIT_AT_QUEUE"),
            RouteCostEvaluator.Verdict.BlockedByRobot => (true, "WAIT_FOR_ROBOT"),
            RouteCostEvaluator.Verdict.Reroute => (true, "REROUTE"),
            _ => (true, "PASS")
        };
        Out("decision", decision);
        var reason = bayBusy is not null ? $"{analysis.Reason}; {bayBusy}: waits at the queue point" : analysis.Reason;
        if (!passed)
        {
            logger.LogWarning("Job {JobNo} ROUTE_CLEAR to {Endpoint}: {Decision} ({Reason})", job.JobNo, goal.Code, decision, reason);
        }

        return (passed, reason);
    }

    private static EndpointPoseSnapshot Pose(EndpointPoseWithType e, Guid mapVersionId) =>
        new(e.Id, mapVersionId, e.Code, e.X, e.Y, e.Yaw ?? 0, e.IsEnabled, e.PositionTolerance);

    /// <summary>
    /// Why the bay is not free for this robot: another robot holds it in traffic or stands in it, another Job's MOVE is
    /// on its way to an endpoint in it, or another robot waited for it first. Null: free.
    /// </summary>
    private async Task<(string Reason, Guid? Robot)?> ZoneBusyByAsync(
        Job job, RobotSnapshot robot, TrafficZone bay, string zoneKey, DateTimeOffset? mySince, CancellationToken cancellationToken)
    {
        if (segmentedTraffic is not null)
        {
            var snapshot = await segmentedTraffic.GetTrafficSnapshotAsync(cancellationToken);
            foreach (var other in snapshot.Robots.Where(r => r.RobotId != robot.Id))
            {
                if (other.OccupiedResourceIds.Contains(bay.ResourceId))
                {
                    return ($"{bay.Code} is held by another robot", other.RobotId);
                }

                if (other.X is double ox && other.Y is double oy && SemanticReservation.PointInRing(ox, oy, bay.Ring))
                {
                    return ($"another robot stands in {bay.Code}", other.RobotId);
                }
            }
        }

        var endpoints = await navigation.GetEndpointsOnMapAsync(job.MapVersionId, cancellationToken);
        var inBay = endpoints.Where(e => SemanticReservation.PointInRing(e.X, e.Y, bay.Ring)).Select(e => e.Id).ToHashSet();
        var others = await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.MOVE
                        && (s.Status == JobStepStatus.EXECUTING || s.Status == JobStepStatus.WAITING)
                        && s.JobTask.JobId != job.Id
                        && s.JobTask.Job.Status == JobStatus.RUNNING)
            .Select(s => new { s.JobTask.Job.JobNo, s.Status, s.TargetEndpointId, s.OutputValues, s.ResolvedInputs })
            .ToListAsync(cancellationToken);
        foreach (var other in others)
        {
            Guid? theirRobot = other.ResolvedInputs.TryGetValue("robotId", out var r) && r.ValueKind == JsonValueKind.String ? r.GetGuid() : null;
            if (theirRobot == robot.Id)
            {
                continue;
            }

            var theirZone = other.OutputValues.TryGetValue(AreaQueueZoneKey, out var z) && z.ValueKind == JsonValueKind.String ? z.GetString() : null;
            if (theirZone == zoneKey)
            {
                // First come, first served: the one that started waiting earlier goes first, decided once.
                if (other.OutputValues.TryGetValue(AreaWaitSinceKey, out var since)
                    && (mySince is null || since.GetDateTimeOffset() < mySince))
                {
                    return ($"{other.JobNo} waits for {bay.Code} first", theirRobot);
                }

                continue;
            }

            if (other.Status == JobStepStatus.EXECUTING && theirZone is null
                && other.TargetEndpointId is Guid target && inBay.Contains(target))
            {
                return ($"{other.JobNo} is on its way into {bay.Code}", theirRobot);
            }
        }

        return null;
    }

    /// <summary>
    /// Nobody else stands on it, drives to it (as a queue point or a goal), or holds its slot.
    /// </summary>
    private async Task<bool> QueuePointFreeAsync(
        Job job, RobotSnapshot robot, EndpointPoseWithType point, SemanticTrafficPolicy policy, CancellationToken cancellationToken)
    {
        var slot = TrafficZones.ZoneAt(policy.TrafficZones, point.X, point.Y);
        if (segmentedTraffic is not null)
        {
            var snapshot = await segmentedTraffic.GetTrafficSnapshotAsync(cancellationToken);
            foreach (var other in snapshot.Robots.Where(r => r.RobotId != robot.Id))
            {
                if (other.X is double ox && other.Y is double oy
                    && Dist(ox, oy, point.X, point.Y) <= Math.Max(QueueOccupiedRadiusMeters, point.PositionTolerance))
                {
                    return false;
                }

                if (slot is { Kind: TrafficZoneKind.Slot } && other.OccupiedResourceIds.Contains(slot.ResourceId))
                {
                    return false;
                }
            }
        }

        var others = await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.MOVE
                        && (s.Status == JobStepStatus.EXECUTING || s.Status == JobStepStatus.WAITING)
                        && s.JobTask.JobId != job.Id
                        && s.JobTask.Job.Status == JobStatus.RUNNING)
            .Select(s => new { s.TargetEndpointId, s.OutputValues })
            .ToListAsync(cancellationToken);
        return !others.Any(o =>
            (o.TargetEndpointId == point.Id && !o.OutputValues.ContainsKey(AreaQueueLegKey))
            || (o.OutputValues.TryGetValue(AreaQueueLegKey, out var leg) && leg.ValueKind == JsonValueKind.String && leg.GetString() == point.Code));
    }
}
