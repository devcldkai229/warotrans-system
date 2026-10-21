using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.WorkflowExecution.Features.ResumeJob;

public static class ResumeJobEndpoint
{
    public static RouteGroupBuilder MapResumeJob(this RouteGroupBuilder group)
    {
        group.MapPost("/jobs/{id:guid}/resume", async (
            Guid id,
            ResumeJobRequest? request,
            ResumeJobHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request ?? new ResumeJobRequest(null), cancellationToken);
            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("ResumeJob")
        .WithSummary("Continue a PAUSED / REASSIGNING Job from the step that stopped it")
        .WithDescription("Re-opens the failed step on the same robot (default) or another AVAILABLE robot on the Job's map. " +
                         "The robot must be localized with fresh telemetry. If it is no longer at the current stop, it drives " +
                         "back there before Staff confirm. Completed steps are kept. 409 job_not_resumable, robot_not_available, " +
                         "robot_not_localized, robot_telemetry_stale, payload_recovery_required.");

        return group;
    }
}
