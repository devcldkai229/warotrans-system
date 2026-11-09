using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.RobotActivity;

public sealed record RobotActivityStepDto(Guid Id, string StepKey, string StepType, string Status, string? OperationCode, DateTimeOffset? StartedAt);

public sealed record RobotActivityContainerDto(Guid ContainerId, string? Barcode, string Status);

/// <summary>
/// BOTH-01: the Job a robot holds right now. An idle robot has none: it is not listed, and the single read returns null.
/// Telemetry fields come with their time so a client can show that they are old instead of presenting them as live.
/// </summary>
public sealed record RobotActivityDto(
    Guid RobotId,
    string? RobotCode,
    Guid JobId,
    string JobNo,
    string JobStatus,
    string? JobFailureCode,
    DateTimeOffset AssignedAt,
    int ProgressPercent,
    string? RequestCode,
    IReadOnlyList<string> RequestCodes,
    RobotActivityStepDto? CurrentStep,
    IReadOnlyList<RobotActivityContainerDto> Containers,
    RobotCommandSummary? LatestCommand,
    bool? IsOnline,
    bool? MotionHeld,
    DateTimeOffset? LastTelemetryAt,
    DateTimeOffset AsOf);

public sealed class RobotActivityQueries(
    WorkflowExecutionDbContext db,
    IFleetModule fleet,
    IWarehouseModule warehouse,
    ITransportRequestCodeLookup requests,
    IRobotAccessScope robotScope,
    TimeProvider clock)
{
    private static readonly JobStepStatus[] InProgress = [JobStepStatus.EXECUTING, JobStepStatus.WAITING, JobStepStatus.READY];

    /// <summary>Every robot in the caller's scope that holds a Job.</summary>
    public async Task<IReadOnlyList<RobotActivityDto>> ListAsync(CancellationToken cancellationToken)
    {
        var scope = await robotScope.GetCurrentAsync(cancellationToken);
        var rows = await db.JobRobotAssignments.AsNoTracking()
            .Where(a => a.EndedAt == null)
            .OrderBy(a => a.StartedAt)
            .Select(a => new { a.RobotId, a.JobId, a.StartedAt })
            .ToListAsync(cancellationToken);

        var result = new List<RobotActivityDto>();
        foreach (var row in rows.Where(r => scope.Allows(r.RobotId)))
        {
            result.Add(await BuildAsync(row.RobotId, row.JobId, row.StartedAt, cancellationToken));
        }

        return result;
    }

    public async Task<RobotActivityDto?> GetAsync(Guid robotId, CancellationToken cancellationToken)
    {
        var row = await db.JobRobotAssignments.AsNoTracking()
            .Where(a => a.EndedAt == null && a.RobotId == robotId)
            .Select(a => new { a.RobotId, a.JobId, a.StartedAt })
            .FirstOrDefaultAsync(cancellationToken);
        return row is null ? null : await BuildAsync(row.RobotId, row.JobId, row.StartedAt, cancellationToken);
    }

    private async Task<RobotActivityDto> BuildAsync(Guid robotId, Guid jobId, DateTimeOffset assignedAt, CancellationToken cancellationToken)
    {
        var job = await db.Jobs.AsNoTracking()
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .Include(j => j.JobContainers)
            .AsSplitQuery()
            .FirstAsync(j => j.Id == jobId, cancellationToken);

        var steps = job.JobTasks.OrderBy(t => t.SequenceNo).SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo)).ToList();
        var finished = steps.Count(s => s.Status is JobStepStatus.COMPLETED or JobStepStatus.SKIPPED);
        var current = steps.FirstOrDefault(s => InProgress.Contains(s.Status)) ?? steps.FirstOrDefault(s => s.Status == JobStepStatus.PENDING);
        RobotActivityStepDto? currentStep = null;
        if (current is not null)
        {
            var definition = await db.WorkflowSteps.AsNoTracking().FirstAsync(s => s.Id == current.WorkflowStepId, cancellationToken);
            currentStep = new RobotActivityStepDto(
                current.Id, definition.StepKey, current.StepType.ToString(), current.Status.ToString(), definition.Config.OperationCode, current.StartedAt);
        }

        var containers = job.JobContainers.OrderBy(c => c.SequenceNo).ToList();
        var barcodes = (await warehouse.GetContainersAsync(containers.Select(c => c.ContainerId).Distinct().ToList(), cancellationToken))
            .ToDictionary(c => c.Id, c => c.Barcode);
        var codes = await requests.GetCodesAsync(containers.Select(c => c.TransportRequestId).Distinct().ToList(), cancellationToken);
        var requestCodes = containers.Select(c => c.TransportRequestId).Distinct()
            .Select(id => codes.GetValueOrDefault(id)).OfType<string>().ToList();
        var robot = await fleet.GetRobotAsync(robotId, cancellationToken);

        return new RobotActivityDto(
            robotId,
            robot?.Code,
            job.Id,
            job.JobNo,
            job.Status.ToString(),
            job.FailureCode,
            assignedAt,
            steps.Count == 0 ? 0 : (int)Math.Round(100.0 * finished / steps.Count),
            requestCodes.FirstOrDefault(),
            requestCodes,
            currentStep,
            containers.Select(c => new RobotActivityContainerDto(c.ContainerId, barcodes.GetValueOrDefault(c.ContainerId), c.Status.ToString())).ToList(),
            await fleet.GetLatestCommandAsync(robotId, cancellationToken),
            robot?.IsOnline,
            robot?.MotionHeld,
            robot?.LastTelemetryAt,
            clock.GetUtcNow());
    }
}

public static class RobotActivityEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/robots/activity", async (RobotActivityQueries queries, CancellationToken cancellationToken) =>
                Results.Ok(new { items = await queries.ListAsync(cancellationToken) }))
            .RequirePermission(Permissions.RobotRead)
            .WithName("ListRobotActivity")
            .WithSummary("The Job each robot in scope holds now; an idle robot is not listed")
            .WithTags("Jobs");

        group.MapGet("/robots/{id:guid}/activity", async (Guid id, RobotActivityQueries queries, CancellationToken cancellationToken) =>
                Results.Ok(new { activity = await queries.GetAsync(id, cancellationToken) }))
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetRobotActivity")
            .WithSummary("The Job this robot holds now; activity is null when it is idle")
            .WithTags("Jobs");
    }
}
