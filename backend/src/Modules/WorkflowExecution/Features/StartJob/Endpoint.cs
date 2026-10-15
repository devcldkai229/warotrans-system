using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.WorkflowExecution.Features.StartJob;

public static class StartJobEndpoint
{
    public static RouteGroupBuilder MapStartJob(this RouteGroupBuilder group)
    {
        group.MapPost("/jobs/{id:guid}/start", async (
            Guid id,
            StartJobRequest? request,
            StartJobHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request ?? new StartJobRequest(null), cancellationToken);
            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("StartJob")
        .WithSummary("Assign a robot to a CREATED Job and start executing its steps")
        .WithDescription("Picks the given robot (or the best AVAILABLE robot on the Job's map), then runs CHECK steps and issues the first MOVE. Later steps advance on robot results and Staff confirmations.");

        return group;
    }
}
