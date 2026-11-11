using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.HumanTasks;

public sealed record HumanTaskDto(
    Guid JobStepId,
    Guid JobId,
    string JobNo,
    string StepKey,
    string StepName,
    string OperationCode,
    Guid? ContainerId,
    string? ContainerBarcode,
    Guid? EndpointId,
    DateTimeOffset? WaitingSince,
    Guid? ClaimedBy,
    string? ClaimedByName,
    DateTimeOffset? ClaimExpiresAt,
    DateTimeOffset? DeadlineAt,
    bool Overdue);

public sealed record TakeOverHumanTaskRequest(string? Reason);

public sealed record ConfirmHandoverBatchRequest(string? Type, IReadOnlyList<Guid>? ContainerIds, string? Note);

public sealed record ConfirmHandoverBatchResponse(IReadOnlyList<HandoverBatchResult> Results, JobDetailDto Job);

public sealed class HumanTaskQueries(
    WorkflowExecutionDbContext db,
    IWarehouseModule warehouse,
    IAccountNameLookup accountNames,
    TimeProvider clock)
{
    /// <summary>Human steps waiting on a running Job, soonest deadline first. A claim that ran out counts as free.</summary>
    public async Task<IReadOnlyList<HumanTaskDto>> ListAsync(Guid? onlyFor, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var rows = await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.HUMAN_INTERACTION
                        && s.Status == JobStepStatus.WAITING
                        && s.JobTask.Job.Status == JobStatus.RUNNING)
            .Select(s => new
            {
                Step = s,
                s.JobTask.JobId,
                s.JobTask.Job.JobNo,
                Definition = db.WorkflowSteps.First(w => w.Id == s.WorkflowStepId)
            })
            .ToListAsync(cancellationToken);

        var containerIds = rows.Select(r => ContainerOf(r.Step.ResolvedInputs)).OfType<Guid>().Distinct().ToList();
        var barcodes = (await warehouse.GetContainersAsync(containerIds, cancellationToken)).ToDictionary(c => c.Id, c => c.Barcode);
        var holders = rows.Where(r => r.Step.ClaimExpiresAt > now).Select(r => r.Step.ClaimedBy).OfType<Guid>().Distinct().ToList();
        var names = await accountNames.GetNamesAsync(holders, cancellationToken);

        return rows
            .Select(r =>
            {
                var live = r.Step.ClaimExpiresAt > now;
                var container = ContainerOf(r.Step.ResolvedInputs);
                return new HumanTaskDto(
                    r.Step.Id,
                    r.JobId,
                    r.JobNo,
                    r.Definition.StepKey,
                    r.Definition.Name,
                    r.Definition.Config.OperationCode,
                    container,
                    container is { } id ? barcodes.GetValueOrDefault(id) : null,
                    r.Step.TargetEndpointId,
                    r.Step.StartedAt,
                    live ? r.Step.ClaimedBy : null,
                    live && r.Step.ClaimedBy is { } holder ? names.GetValueOrDefault(holder) : null,
                    live ? r.Step.ClaimExpiresAt : null,
                    r.Step.DeadlineAt,
                    r.Step.DeadlineAt <= now);
            })
            .Where(t => onlyFor is null || t.ClaimedBy == onlyFor)
            .OrderBy(t => t.DeadlineAt ?? DateTimeOffset.MaxValue)
            .ToList();
    }

    private static Guid? ContainerOf(IReadOnlyDictionary<string, System.Text.Json.JsonElement> inputs) =>
        inputs.TryGetValue("containerId", out var c) && c.ValueKind == System.Text.Json.JsonValueKind.String ? c.GetGuid() : null;
}

/// <summary>WH-03: who handles a waiting human step. APP-OPS-02: confirming several handovers at once.</summary>
public static class HumanTaskEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/human-tasks", async (bool? mine, HumanTaskQueries queries, ICurrentUser currentUser, CancellationToken cancellationToken) =>
                Results.Ok(new { items = await queries.ListAsync(mine == true ? Actor(currentUser) : null, cancellationToken) }))
            .RequirePermission(Permissions.JobOperate)
            .WithName("ListHumanTasks")
            .WithSummary("Human steps waiting for someone, with who holds each and its deadline")
            .WithTags("Jobs");

        group.MapPost("/job-steps/{id:guid}/claim", async (
                Guid id, JobExecutionEngine engine, JobQueries queries, WorkflowExecutionDbContext db, ICurrentUser currentUser, CancellationToken cancellationToken) =>
            {
                await engine.ClaimHumanStepAsync(id, Actor(currentUser), cancellationToken);
                return Results.Ok(await DetailOfStepAsync(id, queries, db, cancellationToken));
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job_step.claimed", "JOB_STEP", "id")
            .WithName("ClaimJobStep")
            .WithSummary("Take a waiting human step, or extend your claim. 409 human_task_claimed when someone else holds it")
            .WithTags("Jobs");

        group.MapPost("/job-steps/{id:guid}/release", async (
                Guid id, JobExecutionEngine engine, JobQueries queries, WorkflowExecutionDbContext db, ICurrentUser currentUser, CancellationToken cancellationToken) =>
            {
                await engine.ReleaseHumanStepAsync(id, Actor(currentUser), cancellationToken);
                return Results.Ok(await DetailOfStepAsync(id, queries, db, cancellationToken));
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job_step.released", "JOB_STEP", "id")
            .WithName("ReleaseJobStep")
            .WithSummary("Give back a step you hold; it is offered to everyone again")
            .WithTags("Jobs");

        group.MapPost("/job-steps/{id:guid}/takeover", async (
                Guid id,
                TakeOverHumanTaskRequest request,
                JobExecutionEngine engine,
                JobQueries queries,
                WorkflowExecutionDbContext db,
                IAuditTrail audit,
                ICurrentUser currentUser,
                CancellationToken cancellationToken) =>
            {
                var reason = request.Reason?.Trim();
                if (string.IsNullOrEmpty(reason))
                {
                    throw new DomainValidationException("Say why you are taking over this step.", "takeover_reason_required");
                }

                var previous = await db.JobSteps.AsNoTracking()
                    .Where(s => s.Id == id)
                    .Select(s => s.ClaimedBy)
                    .FirstOrDefaultAsync(cancellationToken);
                await engine.TakeOverHumanStepAsync(id, Actor(currentUser), cancellationToken);
                await audit.RecordAsync(
                    new AuditEntry(
                        "job_step.taken_over",
                        "JOB_STEP",
                        id,
                        Before: new Dictionary<string, object?> { ["claimedBy"] = previous },
                        After: new Dictionary<string, object?> { ["claimedBy"] = currentUser.AccountId },
                        Reason: reason),
                    cancellationToken);
                return Results.Ok(await DetailOfStepAsync(id, queries, db, cancellationToken));
            })
            .RequirePermission(Permissions.HumanTaskTakeover)
            .WithName("TakeOverJobStep")
            .WithSummary("Take a human step from whoever holds it, with a reason")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/handover/confirm-batch", async (
                Guid id,
                ConfirmHandoverBatchRequest request,
                JobExecutionEngine engine,
                JobQueries queries,
                ICurrentUser currentUser,
                CancellationToken cancellationToken) =>
            {
                if (!Enum.TryParse<HandoverType>(request.Type, ignoreCase: true, out var type) || !Enum.IsDefined(type))
                {
                    throw new DomainValidationException("type must be PICKUP or DROPOFF.", "handover_type_required");
                }

                if (request.ContainerIds is not { Count: > 0 })
                {
                    throw new DomainValidationException("Name at least one container.", "container_ids_required");
                }

                var results = await engine.ConfirmHandoverBatchAsync(id, type, request.ContainerIds, Actor(currentUser), request.Note, cancellationToken);
                return Results.Ok(new ConfirmHandoverBatchResponse(results, await queries.GetDetailAsync(id, cancellationToken)));
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.handover_batch_confirmed", "JOB", "id")
            .WithName("ConfirmHandoverBatch")
            .WithSummary("Confirm several handovers; each container gets its own result")
            .WithDescription("Partial by design: a wrong container changes nothing for the others, and repeating the call changes nothing.")
            .WithTags("Jobs");
    }

    private static Guid Actor(ICurrentUser currentUser) =>
        currentUser.AccountId ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");

    private static async Task<JobDetailDto> DetailOfStepAsync(Guid stepId, JobQueries queries, WorkflowExecutionDbContext db, CancellationToken cancellationToken)
    {
        var jobId = await db.JobSteps.AsNoTracking()
            .Where(s => s.Id == stepId)
            .Select(s => s.JobTask.JobId)
            .FirstAsync(cancellationToken);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }
}
