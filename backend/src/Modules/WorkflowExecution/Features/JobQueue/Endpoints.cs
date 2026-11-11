using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.WorkflowExecution.Features.JobQueue;

/// <summary>FL-07: let a Job go when a robot is free, and see what is waiting and why.</summary>
public static class JobQueueEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/job-queue", async (JobQueueProcessor queue, TimeProvider clock, CancellationToken cancellationToken) =>
                Results.Ok(new { items = await queue.ListAsync(clock.GetUtcNow(), cancellationToken) }))
            .RequirePermission(Permissions.JobRead)
            .WithName("GetJobQueue")
            .WithSummary("Queued Jobs in the order they will go, and why each has not gone yet")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/enqueue", async (Guid id, JobExecutionEngine engine, JobQueries queries, CancellationToken cancellationToken) =>
            {
                await engine.EnqueueAsync(id, cancellationToken);
                return Results.Ok(await queries.GetDetailAsync(id, cancellationToken));
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.enqueued", "JOB", "id")
            .WithName("EnqueueJob")
            .WithSummary("Start this Job as soon as a robot is free")
            .WithTags("Jobs");
    }
}
