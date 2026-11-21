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
    /// Where an idle robot goes when every parking place is taken: endpoint codes, comma separated, tried nearest first.
    /// Empty: it stays where it is. A robot already standing on one of them stays there until a parking place frees up.
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
    Services.FreeEndpointSelector? freeEndpoints = null)
{
    /// <summary>A robot waits this long behind an idle robot before that robot is asked to make way.</summary>
    public const double YieldAfterSeconds = 5;

    /// <summary>A robot that made way is not moved again for this long (no ping-pong between two waiting robots).</summary>
    public const double YieldCooldownSeconds = 60;

    private static readonly Dictionary<(Guid Waiter, Guid Blocker), DateTimeOffset> BlockedSince = [];
    private static readonly Dictionary<Guid, DateTimeOffset> LastYield = [];
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
            .Distinct()
            .ToList();

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
                if (deadlockIds.Contains(blockerId))
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
                .Where(s => s.StepType == StepType.MOVE && s.Status == JobStepStatus.EXECUTING
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

            var fallbackCodes = idle.Value.FallbackCodes();
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

            var target = endpoints
                .Where(e => e.IsEnabled
                            && (e.EndpointType == EndpointType.PARK || fallbackCodes.Contains(e.Code, StringComparer.Ordinal)
                                || e.Code.StartsWith("EP-QUEUE", StringComparison.Ordinal))
                            && Math.Sqrt(Math.Pow(e.X - blocker.PoseX, 2) + Math.Pow(e.Y - blocker.PoseY, 2)) > 0.5
                            && !targets.Contains(e.Id)
                            && others.All(o => Math.Sqrt(Math.Pow(e.X - o.PoseX, 2) + Math.Pow(e.Y - o.PoseY, 2)) > OccupiedRadius(e)))
                .OrderByDescending(Away)
                .FirstOrDefault();
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

            // A parking place first; when all are taken, the fallback (the queue point), unless the robot already stands on it.
            var fallbackCodes = idle.Value.FallbackCodes();
            var target = await ChooseFreeEndpointAsync(robot, e => e.EndpointType == EndpointType.PARK, cancellationToken, ParkWorkflow);
            if (target is null)
            {
                var atFallback = endpoints.Any(e => fallbackCodes.Contains(e.Code, StringComparer.Ordinal) && Distance(robot, e) <= ParkedRadius(e));
                target = atFallback
                    ? null
                    : await ChooseFreeEndpointAsync(robot, e => fallbackCodes.Contains(e.Code, StringComparer.Ordinal), cancellationToken);
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
