using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.RobotCare;

/// <summary>FL-08. Section "FleetIdle".</summary>
public sealed class FleetIdleOptions
{
    public const string SectionName = "FleetIdle";

    /// <summary>
    /// Off by default: with it on, a robot drives by itself with nobody asking, and RBT-001 has no hardware E-stop. Turn it
    /// on only where that has been judged safe.
    /// </summary>
    public bool AutoReturnToPark { get; set; }

    public int IdleSeconds { get; set; } = 300;

    /// <summary>
    /// More wait points (= queue = recovery points), comma separated, besides the endpoints coded or named as one
    /// (<see cref="Services.WaitPoints"/>). An idle robot goes to the nearest free wait point when every parking place is
    /// taken; with none on the map it stays where it is. A robot already standing on one stays there until a parking
    /// place frees up.
    /// </summary>
    public string FallbackEndpointCodes { get; set; } = "EP-QUEUE-POINT";

    /// <summary>
    /// A robot this close to an endpoint occupies it, whatever the endpoint's own tolerance (0.06 m on MAP-ONE). The lab
    /// measured localization errors of 0.16-0.28 m after a stop: with the tolerance alone a parked robot looked like it was
    /// elsewhere, so a second robot could be sent to its place.
    /// </summary>
    public double OccupiedRadiusMeters { get; set; } = 0.30;

    /// <summary>The robot itself counts as already parked within this distance, so it is not sent to park again and again.</summary>
    public double ParkedRadiusMeters { get; set; } = 0.25;

    internal IReadOnlyList<string> FallbackCodes() =>
        (FallbackEndpointCodes ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

/// <summary>
/// FL-08 / WH-06: Jobs that look after a robot: back to parking, to a charger, through maintenance one robot at a time.
/// Each uses a published workflow, so the steps are the ones an administrator can read. Connecting a charger is confirmed
/// by a person: there is no auto-dock.
/// </summary>
public sealed class RobotCareService(
    WorkflowExecutionDbContext db,
    IJobRuntimeProvisioner provisioner,
    JobExecutionEngine engine,
    IFleetModule fleet,
    INavigationModule navigation,
    IOptions<FleetIdleOptions> idle,
    TimeProvider clock,
    ILogger<RobotCareService> logger,
    WaroTrans.Fleet.Traffic.ISegmentedTrafficCoordinator? traffic = null,
    Services.FreeEndpointSelector? freeEndpoints = null,
    IOptions<WaroTrans.Fleet.Traffic.TrafficOptions>? trafficOptions = null)
{
    /// <summary>Codes configured as wait points (FleetIdle fallback + Traffic deadlock retreat), see <see cref="Services.WaitPoints"/>.</summary>
    private IReadOnlyList<string> WaitPointCodes() =>
        Services.WaitPoints.ConfiguredCodes(idle.Value.FallbackEndpointCodes, trafficOptions?.Value.DeadlockRetreatEndpointCodes);

    /// <summary>A robot waits this long behind an idle robot before that robot is asked to make way.</summary>
    public const double YieldAfterSeconds = 5;

    /// <summary>A robot that made way is not moved again for this long (no ping-pong between two waiting robots).</summary>
    public const double YieldCooldownSeconds = 60;

    private static readonly Dictionary<(Guid Waiter, Guid Blocker), DateTimeOffset> BlockedSince = [];
    private static readonly Dictionary<Guid, DateTimeOffset> LastYield = [];

    /// <summary>When a waiting robot's unentered reservation was last freed so an idle robot could make way.</summary>
    private static readonly Dictionary<Guid, DateTimeOffset> LastFreedForYield = [];

    /// <summary>How long a waiting robot gets no new grant after its unentered cells were freed for a robot making way.</summary>
    public const double YieldPassSeconds = 8;
    private static readonly object YieldLock = new();

    public const string ParkWorkflow = "ROBOT_RETURN_TO_PARK";
    public const string ChargeWorkflow = "ROBOT_CHARGING";
    public const string MaintenanceWorkflow = "MAINTENANCE_ALL_ROBOTS";
    public const string MaintenanceKeyPrefix = "maintenance:";
    private const string ParkInput = "parkEndpointId";
    private const string ChargerInput = "chargerEndpointId";
    private const string MaintenanceInput = "maintenanceEndpointId";

    private static readonly JobStatus[] Live =
        [JobStatus.CREATED, JobStatus.QUEUED, JobStatus.ASSIGNED, JobStatus.RUNNING, JobStatus.PAUSED, JobStatus.REASSIGNING, JobStatus.RECOVERY_REQUIRED];

    public async Task<Job> ReturnToParkAsync(Guid robotId, Guid? endpointId, Guid? actor, CancellationToken cancellationToken)
    {
        var robot = await RobotAsync(robotId, cancellationToken);
        var target = endpointId ?? await ChooseFreeEndpointAsync(robot, e => e.EndpointType == EndpointType.PARK, cancellationToken, ParkWorkflow)
            ?? throw new ConflictException("No parking place is free on this map.", "no_free_parking");
        return await RunAsync(robot, ParkWorkflow, ParkInput, target, actor, cancellationToken);
    }

    public async Task<Job> GoToChargerAsync(Guid robotId, Guid? endpointId, Guid? actor, CancellationToken cancellationToken)
    {
        var robot = await RobotAsync(robotId, cancellationToken);
        var target = endpointId ?? await ChooseFreeEndpointAsync(robot, e => e.EndpointType == EndpointType.CHARGER, cancellationToken, ChargeWorkflow)
            ?? throw new ConflictException("No charger is free on this map.", "no_free_charger");
        return await RunAsync(robot, ChargeWorkflow, ChargerInput, target, actor, cancellationToken);
    }

    /// <summary>One Job per robot, never one Job on all of them (rules/12). They run one at a time: see <see cref="RunNextMaintenanceAsync"/>.</summary>
    public async Task<(Guid RunId, IReadOnlyList<Guid> JobIds)> StartMaintenanceRunAsync(
        IReadOnlyList<Guid> robotIds,
        Guid endpointId,
        CancellationToken cancellationToken)
    {
        if (robotIds.Count == 0)
        {
            throw new DomainValidationException("Name at least one robot.", "robot_ids_required");
        }

        var runId = Guid.NewGuid();
        var jobs = new List<Guid>();
        foreach (var robotId in robotIds.Distinct())
        {
            var robot = await RobotAsync(robotId, cancellationToken);
            var workflow = await PublishedWorkflowAsync(MaintenanceWorkflow, cancellationToken);
            jobs.Add(await provisioner.ProvisionRobotJobAsync(
                new RobotJobRequest(
                    robot.WarehouseId,
                    robot.CurrentMapVersionId,
                    workflow,
                    $"{MaintenanceKeyPrefix}{runId:N}:{robotId:N}",
                    new Dictionary<string, JsonElement> { [MaintenanceInput] = JsonSerializer.SerializeToElement(endpointId) }),
                cancellationToken));
        }

        return (runId, jobs);
    }

    /// <summary>
    /// V1 keeps maxConcurrentRobots at 1 (rules/12): the next robot of a run starts once no Job of that run is live. A robot
    /// that cannot start yet says why and is tried again; one that failed does not hold up the others.
    /// </summary>
    public async Task<int> RunNextMaintenanceAsync(CancellationToken cancellationToken)
    {
        var rows = await db.Jobs.AsNoTracking()
            .Where(j => j.ProvisioningKey.StartsWith(MaintenanceKeyPrefix) && Live.Contains(j.Status))
            .Select(j => new { j.Id, j.ProvisioningKey, j.Status, j.CreatedAt, j.BlockingReason })
            .ToListAsync(cancellationToken);

        var started = 0;
        foreach (var run in rows.GroupBy(r => r.ProvisioningKey.Split(':')[1]))
        {
            if (run.Any(r => r.Status != JobStatus.CREATED))
            {
                continue;
            }

            var next = run.OrderBy(r => r.CreatedAt).ThenBy(r => r.ProvisioningKey, StringComparer.Ordinal).First();
            var robotId = Guid.Parse(next.ProvisioningKey.Split(':')[2]);
            try
            {
                await engine.StartAsync(next.Id, robotId, cancellationToken, new JobExecutionEngine.DispatchOverride(null, null, RobotCare: true));
                started++;
            }
            catch (AppException refused)
            {
                db.ChangeTracker.Clear();
                var reason = $"{refused.Code}: {refused.Message}";
                reason = reason.Length > 500 ? reason[..500] : reason;
                if (reason != next.BlockingReason)
                {
                    var job = await db.Jobs.FirstAsync(j => j.Id == next.Id, cancellationToken);
                    job.BlockingReason = reason;
                    await db.SaveChangesAsync(cancellationToken);
                }
            }

            db.ChangeTracker.Clear();
        }

        return started;
    }

    /// <summary>
    /// FL-08: sends robots with nothing to do back to parking, only when turned on, and never while work is waiting: a Job
    /// in the queue is about to need a robot, and sending one away would only delay it.
    /// <para>
    /// This is a Fleet positioning intent, not a ROBOT_RETURN_TO_PARK Job: such a Job holds the robot (one robot per
    /// Job), so a Job arriving while the robot drives to parking could not have it. The intent holds nothing: Dispatch
    /// still offers the robot, and the new Job's first MOVE waits until the parking NAVIGATE is cancelled and traffic is
    /// reconciled. The ROBOT_RETURN_TO_PARK Job stays for an operator who asks for it (<see cref="ReturnToParkAsync"/>).
    /// </para>
    /// </summary>
    /// <summary>
    /// A robot with work waits in traffic behind a robot that has none (parked or left at a shelf): the idle robot makes
    /// way. It drives to a free parking place or queue point, the one farthest from the waiting robot and its goal; its
    /// positioning NAVIGATE yields to any Job it is given meanwhile. On a small map no parking place is off every route,
    /// so an idle robot must never be able to hold up the work.
    /// </summary>
    /// <returns>How many idle robots were sent out of the way.</returns>
    public async Task<int> YieldIdleBlockersAsync(CancellationToken cancellationToken)
    {
        if (traffic is null)
        {
            return 0;
        }

        var now = clock.GetUtcNow();
        var snapshot = await traffic.GetTrafficSnapshotAsync(cancellationToken);
        var pairs = snapshot.Robots
            .Where(r => r.BlockingOwner is not null && r.WaitingReason != WaroTrans.Fleet.Traffic.TrafficWaitingReason.None)
            .Select(r => (Waiter: r.RobotId, Blocker: r.BlockingOwner!.Value))
            .Concat(snapshot.Waits.Where(w => w.BlockingOwner is not null).Select(w => (Waiter: w.RobotId, Blocker: w.BlockingOwner!.Value)))
            .Where(p => p.Waiter != p.Blocker)
            .ToList();
        // A robot waiting for its goal (goal queue) is not waiting in traffic: the robot on that goal is named on its MOVE.
        var goalWaits = await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.MOVE && s.Status == JobStepStatus.WAITING && s.JobTask.Job.Status == JobStatus.RUNNING)
            .Select(s => new { s.ResolvedInputs, s.OutputValues })
            .ToListAsync(cancellationToken);
        foreach (var wait in goalWaits)
        {
            if (wait.OutputValues.TryGetValue(Execution.JobExecutionEngine.GoalBlockerKey, out var b) && b.ValueKind == JsonValueKind.String
                && wait.ResolvedInputs.TryGetValue("robotId", out var w) && w.ValueKind == JsonValueKind.String
                && b.GetGuid() != w.GetGuid())
            {
                pairs.Add((w.GetGuid(), b.GetGuid()));
            }
        }

        pairs = pairs.Distinct().ToList();

        List<(Guid Waiter, Guid Blocker)> due;
        lock (YieldLock)
        {
            foreach (var stale in BlockedSince.Keys.Except(pairs).ToList())
            {
                BlockedSince.Remove(stale);
            }

            foreach (var pair in pairs)
            {
                BlockedSince.TryAdd(pair, now);
            }

            due = pairs.Where(p => (now - BlockedSince[p]).TotalSeconds >= YieldAfterSeconds
                                   && (!LastYield.TryGetValue(p.Blocker, out var last) || (now - last).TotalSeconds >= YieldCooldownSeconds))
                .ToList();
        }

        var positioning = await fleet.GetPositioningRobotIdsAsync(cancellationToken);
        var deadlockIds = snapshot.Robots
            .Where(r => r.WaitingReason == WaroTrans.Fleet.Traffic.TrafficWaitingReason.DeadlockRisk)
            .Select(r => r.RobotId)
            .ToHashSet();

        // An idle robot sent to make way is refused (DEADLOCK_RISK): what the waiting robot was granted but has not
        // entered lies across its way out (traffic cells do not know walls: MAP-ONE SHELF-B-2 next to the INBOUND
        // corridor). Free those cells and hold the waiting robot a moment, as a deadlock retreat does, instead of
        // cancelling the move and trying again a minute later.
        foreach (var (waiterId, blockerId) in pairs)
        {
            bool sentByUs;
            bool freedRecently;
            lock (YieldLock)
            {
                sentByUs = LastYield.TryGetValue(blockerId, out var y) && (now - y).TotalSeconds < YieldCooldownSeconds;
                freedRecently = LastFreedForYield.TryGetValue(waiterId, out var f) && (now - f).TotalSeconds < YieldPassSeconds + 2;
            }

            if (!sentByUs || freedRecently || !positioning.Contains(blockerId) || !deadlockIds.Contains(blockerId))
            {
                continue;
            }

            var freed = await traffic.ReleaseUnenteredReservationAsync(waiterId, YieldPassSeconds, "IDLE_YIELD", cancellationToken);
            lock (YieldLock)
            {
                LastFreedForYield[waiterId] = now;
            }

            logger.LogInformation("Robot {Waiter} lets the robot making way for it pass ({Result})", waiterId, freed.Ok ? "freed" : freed.Reason);
        }
        var sent = 0;
        foreach (var (waiterId, blockerId) in due)
        {
            var blocker = await fleet.GetRobotAsync(blockerId, cancellationToken);
            var waiter = await fleet.GetRobotAsync(waiterId, cancellationToken);
            if (blocker is null || waiter is null)
            {
                continue;
            }

            if (positioning.Contains(blockerId))
            {
                bool makingWay;
                lock (YieldLock)
                {
                    makingWay = LastYield.TryGetValue(blockerId, out var y) && (now - y).TotalSeconds < YieldCooldownSeconds;
                }

                // A robot going home in the way of work gives up; one we sent to make way keeps going (freed above).
                if (deadlockIds.Contains(blockerId) && !makingWay)
                {
                    await fleet.YieldPositioningAsync(blockerId, Guid.Empty, cancellationToken);
                    logger.LogInformation("Robot {Blocker} positioning intent cancelled: deadlocked with {Waiter}", blocker.Code, waiter.Code);
                }

                continue;
            }

            if (!blocker.IsOnline || !blocker.IsEnabled || blocker.MotionHeld || blocker.InManualMode
                || blocker.LocalizationStatus != LocalizationStatus.LOCALIZED
                || blocker.LastTelemetryAt is not { } seen || (now - seen).TotalSeconds > FreshPoseSeconds
                || await db.JobRobotAssignments.AsNoTracking().AnyAsync(a => a.RobotId == blockerId && a.EndedAt == null, cancellationToken))
            {
                continue; // busy, lost or held: not an idle robot that can simply move
            }

            // Where the waiting robot is going: the endpoint of its open MOVE, if any.
            var goal = await db.JobSteps.AsNoTracking()
                .Where(s => s.StepType == StepType.MOVE && (s.Status == JobStepStatus.EXECUTING || s.Status == JobStepStatus.WAITING)
                            && s.JobTask.Job.Status == JobStatus.RUNNING && s.TargetEndpointId != null)
                .Select(s => new { s.TargetEndpointId, s.ResolvedInputs })
                .ToListAsync(cancellationToken);
            EndpointPoseSnapshot? goalPose = null;
            foreach (var g in goal)
            {
                if (g.ResolvedInputs.TryGetValue("robotId", out var r) && r.ValueKind == JsonValueKind.String && r.GetGuid() == waiterId)
                {
                    goalPose = await navigation.GetEndpointPoseAsync(g.TargetEndpointId!.Value, cancellationToken);
                    break;
                }
            }

            var waitPointCodes = WaitPointCodes();
            var endpoints = await navigation.GetEndpointsOnMapAsync(blocker.CurrentMapVersionId, cancellationToken);
            var others = (await fleet.GetDispatchCandidatesAsync(blocker.CurrentMapVersionId, cancellationToken))
                .Where(r => r.Id != blockerId && r.LocalizationStatus == LocalizationStatus.LOCALIZED)
                .ToList();
            var targets = await fleet.GetPositioningTargetsAsync(blocker.CurrentMapVersionId, cancellationToken);
            double Away(EndpointPoseWithType e)
            {
                var d = Math.Sqrt(Math.Pow(e.X - waiter.PoseX, 2) + Math.Pow(e.Y - waiter.PoseY, 2));
                if (goalPose is not null)
                {
                    d = Math.Min(d, Math.Sqrt(Math.Pow(e.X - goalPose.X, 2) + Math.Pow(e.Y - goalPose.Y, 2)));
                    d = Math.Min(d, DistanceToSegment(e.X, e.Y, waiter.PoseX, waiter.PoseY, goalPose.X, goalPose.Y));
                }

                return d;
            }

            // Off the way the waiting robot planned (what traffic holds it to), else it would only block it further on.
            var waiterPath = snapshot.Robots.FirstOrDefault(r => r.RobotId == waiterId) is { ProposedPath.IsDefaultOrEmpty: false } view
                ? view.ProposedPath.Select(p => (p.X, p.Y)).ToList()
                : [];
            bool OffItsPath(EndpointPoseWithType e) =>
                waiterPath.All(p => Math.Sqrt(Math.Pow(e.X - p.X, 2) + Math.Pow(e.Y - p.Y, 2)) >= Execution.JobExecutionEngine.PathClearanceMeters);
            var headedTo = await db.JobSteps.AsNoTracking()
                .Where(s => s.StepType == StepType.MOVE && s.TargetEndpointId != null
                            && (s.Status == JobStepStatus.EXECUTING || s.Status == JobStepStatus.WAITING || s.Status == JobStepStatus.READY)
                            && s.JobTask.Job.Status == JobStatus.RUNNING)
                .Select(s => s.TargetEndpointId!.Value)
                .ToListAsync(cancellationToken);
            EndpointPoseWithType? Pick(IEnumerable<EndpointPoseWithType> pool) => pool
                .Where(e => Math.Sqrt(Math.Pow(e.X - blocker.PoseX, 2) + Math.Pow(e.Y - blocker.PoseY, 2)) > 0.5
                            && !targets.Contains(e.Id)
                            && others.All(o => Math.Sqrt(Math.Pow(e.X - o.PoseX, 2) + Math.Pow(e.Y - o.PoseY, 2)) > OccupiedRadius(e)))
                .OrderByDescending(e => OffItsPath(e))
                .ThenByDescending(Away)
                .FirstOrDefault();
            // A parking place or wait point first; on a map with too few, any free endpoint off the waiting robot's way
            // that no live Job is headed to (a charger never).
            var standAside = endpoints.Where(e => Services.WaitPoints.IsStandAside(e, waitPointCodes)).ToList();
            var target = Pick(standAside.Where(OffItsPath))
                         ?? Pick(endpoints.Where(e => e.IsEnabled && e.EndpointType != EndpointType.CHARGER && !standAside.Contains(e)
                                                      && !headedTo.Contains(e.Id) && OffItsPath(e)))
                         ?? Pick(standAside);
            // Any free place beats standing in the way of a robot with work (the cooldown stops ping-pong).
            if (target is null || Away(target) <= 0.30)
            {
                logger.LogInformation("Robot {Blocker} is in the way of {Waiter} but has nowhere better to go", blocker.Code, waiter.Code);
                continue;
            }

            var pose = await navigation.GetEndpointPoseAsync(target.Id, cancellationToken);
            if (pose is not { IsEnabled: true })
            {
                continue;
            }

            try
            {
                await fleet.StartReturnToParkAsync(blockerId, pose.Id, pose.X, pose.Y, pose.Yaw, cancellationToken);
                lock (YieldLock)
                {
                    LastYield[blockerId] = now;
                }

                sent++;
                logger.LogInformation(
                    "Robot {Blocker} (idle) makes way for {Waiter}: going to {Endpoint}", blocker.Code, waiter.Code, pose.Code);
            }
            catch (AppException refused)
            {
                logger.LogInformation("Robot {Blocker} cannot make way for {Waiter}: {Code}", blocker.Code, waiter.Code, refused.Code);
            }
        }

        return sent;
    }

    private static double DistanceToSegment(double px, double py, double ax, double ay, double bx, double by)
    {
        var vx = bx - ax;
        var vy = by - ay;
        var len = vx * vx + vy * vy;
        var t = len <= 0 ? 0 : Math.Clamp(((px - ax) * vx + (py - ay) * vy) / len, 0, 1);
        return Math.Sqrt(Math.Pow(px - (ax + t * vx), 2) + Math.Pow(py - (ay + t * vy), 2));
    }

    public async Task<int> ReturnIdleRobotsAsync(CancellationToken cancellationToken)
    {
        // Intents end with their NAVIGATE; close them whether auto-return is on or not.
        await fleet.SettlePositioningAsync(cancellationToken);

        if (!idle.Value.AutoReturnToPark
            || await db.Jobs.AsNoTracking().AnyAsync(j => j.Status == JobStatus.QUEUED, cancellationToken))
        {
            return 0;
        }

        var now = clock.GetUtcNow();
        var positioning = await fleet.GetPositioningRobotIdsAsync(cancellationToken);
        var sent = 0;
        foreach (var candidate in await fleet.GetIdleRobotsAsync(cancellationToken))
        {
            var robot = candidate.Robot;
            var quietSince = candidate.LastCommandAt;
            if (positioning.Contains(robot.Id)
                || (quietSince is { } last && (now - last).TotalSeconds < idle.Value.IdleSeconds)
                // Its pose decides the nearest free place and what traffic reserves: no guess from a stale or lost pose.
                || robot.LocalizationStatus != LocalizationStatus.LOCALIZED
                || robot.LastTelemetryAt is not { } seen || (now - seen).TotalSeconds > FreshPoseSeconds)
            {
                continue;
            }

            var holdsJob = await db.JobRobotAssignments.AsNoTracking().AnyAsync(a => a.RobotId == robot.Id && a.EndedAt == null, cancellationToken);
            var endpoints = await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken);
            var alreadyParked = endpoints.Any(e => e.EndpointType == EndpointType.PARK && Distance(robot, e) <= ParkedRadius(e));
            if (holdsJob || alreadyParked)
            {
                continue;
            }

            // A parking place first; when all are taken, a wait point (= queue = recovery point), unless the robot
            // already stands on one.
            var target = await ChooseFreeEndpointAsync(robot, e => e.EndpointType == EndpointType.PARK, cancellationToken, ParkWorkflow);
            if (target is null)
            {
                var atFallback = endpoints.Any(e => IsRecoveryPoint(e) && Distance(robot, e) <= ParkedRadius(e));
                target = atFallback
                    ? null
                    : await ChooseFreeEndpointAsync(robot, IsRecoveryPoint, cancellationToken);
                if (target is not null)
                {
                    logger.LogInformation("Robot {RobotCode}: every parking place is taken, going to the fallback endpoint", robot.Code);
                }
            }

            var pose = target is { } id ? await navigation.GetEndpointPoseAsync(id, cancellationToken) : null;
            if (pose is not { IsEnabled: true })
            {
                logger.LogInformation("Robot {RobotCode} stays where it is: no free parking place or fallback endpoint", robot.Code);
                continue;
            }

            try
            {
                await fleet.StartReturnToParkAsync(robot.Id, pose.Id, pose.X, pose.Y, pose.Yaw, cancellationToken);
                sent++;
            }
            catch (AppException refused)
            {
                logger.LogInformation("Robot {RobotCode} stays where it is: {Code}", robot.Code, refused.Code);
            }
        }

        return sent;
    }

    /// <summary>Telemetry older than this does not count as knowing where the robot is.</summary>
    private const double FreshPoseSeconds = 10;

    // ------------------------------------------------------------------ TRN-03 cancellation destinations

    /// <summary>
    /// Wait = Queue = Recovery Point: an enabled, non-charger endpoint named or coded as one (EP-QUEUE*, EP-WAIT*,
    /// EP-RECOVERY*, "wait" / "queue" / "recovery" in its name) or listed in FleetIdle:FallbackEndpointCodes or
    /// Traffic:DeadlockRetreatEndpointCodes. The same rule decides where robots make way and back off (WaitPoints).
    /// </summary>
    public bool IsRecoveryPoint(EndpointPoseWithType e) => Services.WaitPoints.Is(e, WaitPointCodes());

    /// <summary>The recovery points on the robot's map, free ones first, nearest first.</summary>
    public async Task<IReadOnlyList<RecoveryPointView>> RecoveryPointsAsync(Guid robotId, CancellationToken cancellationToken)
    {
        var robot = await RobotAsync(robotId, cancellationToken);
        var endpoints = (await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken))
            .Where(IsRecoveryPoint)
            .ToList();
        if (endpoints.Count == 0)
        {
            return [];
        }

        var taken = await TakenEndpointsAsync(robot, endpoints, cancellationToken);
        var known = robot.LocalizationStatus == LocalizationStatus.LOCALIZED;
        return endpoints
            .Select(e => new RecoveryPointView(e.Id, e.Code, e.Name, !taken.Contains(e.Id), known ? Math.Round(Distance(robot, e), 2) : null))
            .OrderByDescending(p => p.Free)
            .ThenBy(p => p.DistanceMeters ?? double.MaxValue)
            .ThenBy(p => p.Code, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// After a cancellation: to a free parking place (or, with <paramref name="allowWaitPoint"/>, the nearer of a free
    /// parking place and a free wait point). Uses a positioning intent, so a new Job takes the robot over at once.
    /// Never sends a robot that is offline, held, lost, in manual mode, still on a Job or already parked.
    /// </summary>
    public async Task<RobotDestinationResult> SendAfterCancelAsync(Guid robotId, bool allowWaitPoint, CancellationToken cancellationToken)
    {
        var robot = await fleet.GetRobotAsync(robotId, cancellationToken);
        if (robot is null)
        {
            return new RobotDestinationResult(RobotDestinationResult.Skipped, null, "robot_not_found");
        }

        if (!robot.IsEnabled || robot.InManualMode)
        {
            return new RobotDestinationResult(RobotDestinationResult.Skipped, null, robot.InManualMode ? "robot_in_manual_mode" : "robot_disabled");
        }

        var now = clock.GetUtcNow();
        if (!robot.IsOnline)
        {
            return new RobotDestinationResult(RobotDestinationResult.Retry, null, "robot_offline");
        }

        if (robot.MotionHeld)
        {
            return new RobotDestinationResult(RobotDestinationResult.Retry, null, "robot_motion_held");
        }

        if (robot.LocalizationStatus != LocalizationStatus.LOCALIZED
            || robot.LastTelemetryAt is not { } seen || (now - seen).TotalSeconds > FreshPoseSeconds)
        {
            return new RobotDestinationResult(RobotDestinationResult.Retry, null, "robot_not_localized");
        }

        var liveJobIds = await db.Jobs.AsNoTracking().Where(j => Live.Contains(j.Status)).Select(j => j.Id).ToListAsync(cancellationToken);
        var onJob = await db.JobRobotAssignments.AsNoTracking()
            .AnyAsync(a => a.RobotId == robotId && a.EndedAt == null && liveJobIds.Contains(a.JobId), cancellationToken);
        if (onJob)
        {
            return new RobotDestinationResult(RobotDestinationResult.NotNeeded, null, "robot_on_another_job");
        }

        if ((await fleet.GetPositioningRobotIdsAsync(cancellationToken)).Contains(robotId))
        {
            return new RobotDestinationResult(RobotDestinationResult.NotNeeded, null, "robot_already_positioning");
        }

        var endpoints = await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken);
        if (endpoints.FirstOrDefault(e => e.EndpointType == EndpointType.PARK && Distance(robot, e) <= ParkedRadius(e)) is { } parked)
        {
            return new RobotDestinationResult(RobotDestinationResult.NotNeeded, parked.Code, "already_parked");
        }

        Guid? target;
        if (allowWaitPoint)
        {
            var candidates = endpoints.Where(e => e.IsEnabled && (e.EndpointType == EndpointType.PARK || IsRecoveryPoint(e))).ToList();
            if (candidates.FirstOrDefault(e => IsRecoveryPoint(e) && Distance(robot, e) <= ParkedRadius(e)) is { } waiting)
            {
                return new RobotDestinationResult(RobotDestinationResult.NotNeeded, waiting.Code, "already_at_wait_point");
            }

            var taken = await TakenEndpointsAsync(robot, candidates, cancellationToken);
            target = candidates.Where(e => !taken.Contains(e.Id)).OrderBy(e => Distance(robot, e)).Select(e => (Guid?)e.Id).FirstOrDefault();
        }
        else
        {
            target = await ChooseFreeEndpointAsync(robot, e => e.EndpointType == EndpointType.PARK, cancellationToken, ParkWorkflow);
            if (target is null)
            {
                if (endpoints.Where(IsRecoveryPoint).FirstOrDefault(e => Distance(robot, e) <= ParkedRadius(e)) is { } waiting)
                {
                    return new RobotDestinationResult(RobotDestinationResult.NotNeeded, waiting.Code, "already_at_wait_point");
                }

                target = await ChooseFreeEndpointAsync(robot, IsRecoveryPoint, cancellationToken);
            }
        }

        var pose = target is { } id ? await navigation.GetEndpointPoseAsync(id, cancellationToken) : null;
        if (pose is not { IsEnabled: true })
        {
            return new RobotDestinationResult(RobotDestinationResult.Retry, null, "no_free_parking");
        }

        try
        {
            await fleet.StartReturnToParkAsync(robotId, pose.Id, pose.X, pose.Y, pose.Yaw, cancellationToken);
        }
        catch (AppException refused)
        {
            return new RobotDestinationResult(RobotDestinationResult.Retry, pose.Code, refused.Code);
        }

        logger.LogInformation("Robot {RobotCode}: cancellation over, going to {Endpoint}", robot.Code, pose.Code);
        return new RobotDestinationResult(RobotDestinationResult.Sent, pose.Code, null);
    }

    /// <summary>Endpoints another robot stands on or is driving to (positioning, a recovery leg).</summary>
    private async Task<HashSet<Guid>> TakenEndpointsAsync(RobotSnapshot robot, IReadOnlyList<EndpointPoseWithType> endpoints, CancellationToken cancellationToken)
    {
        var others = (await fleet.GetDispatchCandidatesAsync(robot.CurrentMapVersionId, cancellationToken))
            .Concat((await fleet.GetIdleRobotsAsync(cancellationToken)).Select(i => i.Robot))
            .Where(r => r.Id != robot.Id && r.CurrentMapVersionId == robot.CurrentMapVersionId)
            .ToList();
        var busyRobots = await db.JobRobotAssignments.AsNoTracking()
            .Where(a => a.RobotId != robot.Id && a.EndedAt == null)
            .Select(a => a.RobotId)
            .Distinct()
            .ToListAsync(cancellationToken);
        foreach (var busyId in busyRobots.Where(id => others.All(o => o.Id != id)))
        {
            if (await fleet.GetRobotAsync(busyId, cancellationToken) is { } busy && busy.CurrentMapVersionId == robot.CurrentMapVersionId)
            {
                others.Add(busy);
            }
        }

        var taken = (await fleet.GetPositioningTargetsAsync(robot.CurrentMapVersionId, cancellationToken)).ToHashSet();
        var legs = await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.MOVE && s.Status != JobStepStatus.COMPLETED && s.JobTask.Job.Status == JobStatus.RUNNING)
            .Select(s => s.OutputValues)
            .ToListAsync(cancellationToken);
        foreach (var outputs in legs)
        {
            if (outputs.TryGetValue(JobExecutionEngine.CancelRecoveryToKey, out var leg) && leg.ValueKind == JsonValueKind.String)
            {
                taken.Add(leg.GetGuid());
            }
        }

        foreach (var e in endpoints.Where(e => others.Any(r => Distance(r, e) <= OccupiedRadius(e))))
        {
            taken.Add(e.Id);
        }

        return taken;
    }

    private async Task<Job> RunAsync(RobotSnapshot robot, string workflowCode, string input, Guid endpointId, Guid? actor, CancellationToken cancellationToken)
    {
        var pose = await navigation.GetEndpointPoseAsync(endpointId, cancellationToken);
        if (pose is not { IsEnabled: true } || pose.MapVersionId != robot.CurrentMapVersionId)
        {
            throw new DomainValidationException("That endpoint is disabled or on another map.", "endpoint_invalid");
        }

        var workflow = await PublishedWorkflowAsync(workflowCode, cancellationToken);
        var jobId = await provisioner.ProvisionRobotJobAsync(
            new RobotJobRequest(
                robot.WarehouseId,
                robot.CurrentMapVersionId,
                workflow,
                $"robot-care:{workflowCode}:{robot.Id:N}:{Guid.NewGuid():N}",
                new Dictionary<string, JsonElement> { [input] = JsonSerializer.SerializeToElement(endpointId) }),
            cancellationToken);
        try
        {
            return await engine.StartAsync(jobId, robot.Id, cancellationToken, new JobExecutionEngine.DispatchOverride(actor, null, RobotCare: true));
        }
        catch (AppException)
        {
            // The robot could not take it: a Job nobody will start again must not stay behind.
            db.ChangeTracker.Clear();
            var job = await db.Jobs.FirstAsync(j => j.Id == jobId, cancellationToken);
            db.Jobs.Remove(job);
            await db.SaveChangesAsync(cancellationToken);
            throw;
        }
    }

    private async Task<RobotSnapshot> RobotAsync(Guid robotId, CancellationToken cancellationToken) =>
        await fleet.GetRobotAsync(robotId, cancellationToken)
        ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

    private async Task<Guid> PublishedWorkflowAsync(string code, CancellationToken cancellationToken)
    {
        var id = await db.Workflows.AsNoTracking()
            .Where(w => w.Code == code && w.Status == WorkflowStatus.PUBLISHED)
            .OrderByDescending(w => w.VersionNo)
            .Select(w => (Guid?)w.Id)
            .FirstOrDefaultAsync(cancellationToken);
        return id ?? throw new ConflictException($"Publish the workflow {code} first (samples/workflows has one).", "workflow_not_published");
    }

    /// <summary>
    /// A free place for the robot. When <paramref name="workflowCode"/>'s published version names an EndpointGroup (an
    /// ADMIN_INPUT variable of format WAYPOINT_GROUP) on the robot's map, its members are the candidates and its selection
    /// policy decides; otherwise every enabled place matching <paramref name="kind"/>, nearest first.
    /// </summary>
    private async Task<Guid?> ChooseFreeEndpointAsync(
        RobotSnapshot robot,
        Func<EndpointPoseWithType, bool> kind,
        CancellationToken cancellationToken,
        string? workflowCode = null)
    {
        var group = workflowCode is null ? null : await ConfiguredGroupAsync(workflowCode, robot, cancellationToken);
        var candidates = group?.Members
            ?? (await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken)).Where(e => kind(e) && e.IsEnabled).ToList();
        var selector = freeEndpoints ?? new Services.FreeEndpointSelector(db, fleet, idle);
        return await selector.ChooseAsync(robot, candidates, group?.SelectionPolicy ?? EndpointSelectionPolicy.NEAREST, null, cancellationToken);
    }

    /// <summary>The EndpointGroup an administrator chose in the published workflow, when it is active and on the robot's map.</summary>
    private async Task<EndpointGroupSnapshot?> ConfiguredGroupAsync(string workflowCode, RobotSnapshot robot, CancellationToken cancellationToken)
    {
        var variables = await db.Workflows.AsNoTracking()
            .Where(w => w.Code == workflowCode && w.Status == WorkflowStatus.PUBLISHED)
            .OrderByDescending(w => w.VersionNo)
            .Select(w => w.VariablesSchema)
            .FirstOrDefaultAsync(cancellationToken);
        var configured = variables?
            .Where(v => v.Format == ValueObjects.WorkflowVariableDefinition.WaypointGroupFormat && v.ConfiguredValue is { ValueKind: JsonValueKind.String })
            .Select(v => v.ConfiguredValue!.Value.TryGetGuid(out var id) ? id : (Guid?)null)
            .FirstOrDefault(id => id is not null);
        if (configured is not { } groupId)
        {
            return null;
        }

        var group = await navigation.GetEndpointGroupAsync(groupId, cancellationToken);
        if (group is not { IsActive: true } || group.MapVersionId != robot.CurrentMapVersionId)
        {
            logger.LogWarning(
                "{Workflow}: endpoint group {GroupId} is inactive or not on {Robot}'s map; choosing by endpoint type instead",
                workflowCode, groupId, robot.Code);
            return null;
        }

        return group;
    }

    private double OccupiedRadius(EndpointPoseWithType endpoint) => Math.Max(endpoint.PositionTolerance, idle.Value.OccupiedRadiusMeters);

    private double ParkedRadius(EndpointPoseWithType endpoint) => Math.Max(endpoint.PositionTolerance, idle.Value.ParkedRadiusMeters);

    private static double Distance(RobotSnapshot robot, EndpointPoseWithType endpoint) =>
        Math.Sqrt(Math.Pow(robot.PoseX - endpoint.X, 2) + Math.Pow(robot.PoseY - endpoint.Y, 2));
}
