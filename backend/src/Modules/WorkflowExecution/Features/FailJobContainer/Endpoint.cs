using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using Microsoft.EntityFrameworkCore;

namespace WaroTrans.WorkflowExecution.Features.FailJobContainer;

public sealed record FailJobContainerRequest(Guid ContainerId, string? Reason);

public sealed class FailJobContainerHandler(JobExecutionEngine engine, JobQueries queries, WorkflowExecutionDbContext db, ICurrentUser currentUser)
{
    public async Task<JobDetailDto> HandleAsync(Guid jobStepId, FailJobContainerRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new DomainValidationException("Say why this container cannot go on.", "container_failure_reason_required");
        }

        await engine.FailContainerAtStepAsync(jobStepId, request.ContainerId, request.Reason.Trim(), cancellationToken, currentUser.AccountId);

        var jobId = await db.JobSteps.AsNoTracking()
            .Where(s => s.Id == jobStepId)
            .Select(s => s.JobTask.JobId)
            .FirstAsync(cancellationToken);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }
}

public static class FailJobContainerEndpoint
{
    public static RouteGroupBuilder MapFailJobContainer(this RouteGroupBuilder group)
    {
        group.MapPost("/job-steps/{id:guid}/fail-container", async (
            Guid id,
            FailJobContainerRequest request,
            FailJobContainerHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, request, cancellationToken)))
        .RequirePermission(Permissions.JobOperate)
        .Audited("job_container.failed", "JOB_STEP", "id")
        .WithName("FailJobContainer")
        .WithSummary("Report that the container of a waiting handover step cannot go on (WH-10)")
        .WithDescription(
            "That container fails with the reason, what only served it is skipped and the Job goes on with the others. " +
            "What was delivered stays delivered, and the Transport Request reflects each container.");

        return group;
    }
}
