using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.Dispatch;

/// <param name="RobotId">The robot to use; empty = the best eligible robot.</param>
/// <param name="OverrideReason">
/// Needed (with dispatch.override) to use a robot whose battery is unknown or stale. Nothing else can be overridden:
/// a low battery, maintenance, manual mode, a held or busy robot always refuse.
/// </param>
public sealed record DispatchJobRequest(Guid? RobotId, string? OverrideReason);

/// <summary>FL-02: see why each robot is (not) a candidate for a Job, dispatch it, and read past decisions.</summary>
public static class DispatchEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/jobs/{id:guid}/dispatch-candidates", async (
                Guid id, JobExecutionEngine engine, CancellationToken cancellationToken) =>
            Results.Ok(await engine.EvaluateDispatchAsync(id, cancellationToken)))
            .RequirePermission(Permissions.JobRead)
            .WithName("GetJobDispatchCandidates")
            .WithSummary("Every robot on the Job's map: eligible or not, why, and its score (lower is better)")
            .WithTags("Jobs");

        group.MapGet("/jobs/{id:guid}/dispatch-decisions", async (
                Guid id, IFleetModule fleet, CancellationToken cancellationToken) =>
            Results.Ok(await fleet.GetDispatchDecisionsAsync(id, cancellationToken)))
            .RequirePermission(Permissions.JobRead)
            .WithName("GetJobDispatchDecisions")
            .WithSummary("Past dispatch decisions of a Job with the candidates each one saw")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/dispatch", async (
                Guid id,
                DispatchJobRequest? request,
                JobExecutionEngine engine,
                JobQueries queries,
                ICurrentUser currentUser,
                CancellationToken cancellationToken) =>
            {
                var body = request ?? new DispatchJobRequest(null, null);
                var reason = body.OverrideReason?.Trim();
                if (!string.IsNullOrEmpty(reason) && !currentUser.Can(Permissions.DispatchOverride))
                {
                    throw new AppException("Overriding dispatch needs the dispatch.override permission.", StatusCodes.Status403Forbidden, "forbidden");
                }

                await engine.StartAsync(
                    id,
                    body.RobotId,
                    cancellationToken,
                    new JobExecutionEngine.DispatchOverride(currentUser.AccountId, string.IsNullOrEmpty(reason) ? null : reason));
                return Results.Ok(await queries.GetDetailAsync(id, cancellationToken));
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.dispatched", "JOB", "id")
            .WithName("DispatchJob")
            .WithSummary("Start a Job on the chosen (or best) robot, optionally overriding an unknown battery with a reason")
            .WithTags("Jobs");
    }
}
