using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.PauseJob;

public sealed record PauseJobRequest(string? Reason);

public sealed class PauseJobHandler(JobExecutionEngine engine, JobQueries queries)
{
    public async Task<JobDetailDto> HandleAsync(Guid jobId, PauseJobRequest request, CancellationToken cancellationToken)
    {
        await engine.PauseAsync(jobId, request.Reason, cancellationToken);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }
}

public static class PauseJobEndpoint
{
    public static RouteGroupBuilder MapPauseJob(this RouteGroupBuilder group)
    {
        group.MapPost("/jobs/{id:guid}/pause", async (
                Guid id,
                PauseJobRequest? request,
                PauseJobHandler handler,
                CancellationToken cancellationToken) =>
                Results.Ok(await handler.HandleAsync(id, request ?? new PauseJobRequest(null), cancellationToken)))
            .RequirePermission(Permissions.JobPause)
            .Audited("job.paused", "JOB", "id")
            .WithName("PauseJob")
            .WithSummary("Operator pause: stop the robot (STOP mode PAUSE) and hold the Job; resume sends a new move")
            .WithDescription("The answer is the Job (PAUSED, failureCode operator_paused). Whether the robot really stopped is read from GET /api/fleet/robots/{robotId}/stop-state.")
            .WithTags("Jobs");

        return group;
    }
}
