using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.WorkflowExecution.Features.CancelJob;

public static class CancelJobEndpoint
{
    public static RouteGroupBuilder MapCancelJob(this RouteGroupBuilder group)
    {
        group.MapPost("/jobs/{id:guid}/cancel", async (
                Guid id,
                CancelJobRequest? request,
                CancelJobHandler handler,
                CancellationToken cancellationToken) =>
            {
                var response = await handler.HandleAsync(id, request ?? new CancelJobRequest(null), cancellationToken);
                return Results.Ok(response);
            })
            .WithName("CancelJob")
            .WithSummary("Cancel a running job; traffic occupancy is quarantined until verified clearance")
            .WithTags("Jobs")
            .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}
