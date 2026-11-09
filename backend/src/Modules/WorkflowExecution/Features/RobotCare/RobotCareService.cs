using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
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
    ILogger<RobotCareService> logger)
{
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
        var target = endpointId ?? await ChooseFreeEndpointAsync(robot, EndpointType.PARK, ParkInput, cancellationToken)
            ?? throw new ConflictException("No parking place is free on this map.", "no_free_parking");
        return await RunAsync(robot, ParkWorkflow, ParkInput, target, actor, cancellationToken);
    }

    public async Task<Job> GoToChargerAsync(Guid robotId, Guid? endpointId, Guid? actor, CancellationToken cancellationToken)
    {
        var robot = await RobotAsync(robotId, cancellationToken);
        var target = endpointId ?? await ChooseFreeEndpointAsync(robot, EndpointType.CHARGER, ChargerInput, cancellationToken)
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
    /// </summary>
    public async Task<int> ReturnIdleRobotsAsync(CancellationToken cancellationToken)
    {
        if (!idle.Value.AutoReturnToPark
            || await db.Jobs.AsNoTracking().AnyAsync(j => j.Status == JobStatus.QUEUED, cancellationToken))
        {
            return 0;
        }

        var now = clock.GetUtcNow();
        var sent = 0;
        foreach (var candidate in await fleet.GetIdleRobotsAsync(cancellationToken))
        {
            var quietSince = candidate.LastCommandAt;
            if (quietSince is { } last && (now - last).TotalSeconds < idle.Value.IdleSeconds)
            {
                continue;
            }

            var robot = candidate.Robot;
            var holdsJob = await db.JobRobotAssignments.AsNoTracking().AnyAsync(a => a.RobotId == robot.Id && a.EndedAt == null, cancellationToken);
            var endpoints = await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken);
            var alreadyParked = endpoints.Any(e => e.EndpointType == EndpointType.PARK && Distance(robot, e) <= e.PositionTolerance);
            if (holdsJob || alreadyParked)
            {
                continue;
            }

            try
            {
                await ReturnToParkAsync(robot.Id, null, null, cancellationToken);
                sent++;
            }
            catch (AppException refused)
            {
                db.ChangeTracker.Clear();
                logger.LogInformation("Robot {RobotCode} stays where it is: {Code}", robot.Code, refused.Code);
            }
        }

        return sent;
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

    /// <summary>The nearest enabled place of this kind where no other robot is standing and none is headed.</summary>
    private async Task<Guid?> ChooseFreeEndpointAsync(RobotSnapshot robot, EndpointType type, string input, CancellationToken cancellationToken)
    {
        var endpoints = (await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken))
            .Where(e => e.EndpointType == type && e.IsEnabled)
            .ToList();
        if (endpoints.Count == 0)
        {
            return null;
        }

        var others = (await fleet.GetDispatchCandidatesAsync(robot.CurrentMapVersionId, cancellationToken)).Where(r => r.Id != robot.Id).ToList();
        var liveJobs = await db.Jobs.AsNoTracking()
            .Where(j => j.ProvisioningKey.StartsWith("robot-care:") && Live.Contains(j.Status))
            .ToListAsync(cancellationToken);
        var headedFor = liveJobs
            .Select(j => j.ContextValues.TryGetValue(input, out var v) && v.ValueKind == JsonValueKind.String ? v.GetGuid() : (Guid?)null)
            .OfType<Guid>()
            .ToHashSet();

        return endpoints
            .Where(e => !headedFor.Contains(e.Id) && !others.Any(r => Distance(r, e) <= e.PositionTolerance))
            .OrderBy(e => Distance(robot, e))
            .Select(e => (Guid?)e.Id)
            .FirstOrDefault();
    }

    private static double Distance(RobotSnapshot robot, EndpointPoseWithType endpoint) =>
        Math.Sqrt(Math.Pow(robot.PoseX - endpoint.X, 2) + Math.Pow(robot.PoseY - endpoint.Y, 2));
}
