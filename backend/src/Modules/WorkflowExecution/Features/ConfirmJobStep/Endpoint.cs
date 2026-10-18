using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.WorkflowExecution.Features.ConfirmJobStep;

public static class ConfirmJobStepEndpoint
{
    public static RouteGroupBuilder MapConfirmJobStep(this RouteGroupBuilder group)
    {
        group.MapPost("/job-steps/{id:guid}/confirm", async (
            Guid id,
            ConfirmJobStepRequest request,
            ConfirmJobStepHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("ConfirmJobStep")
        .WithSummary("Staff confirms a waiting HUMAN_INTERACTION step (PICKUP_CONFIRM / DROPOFF_CONFIRM)")
        .WithDescription("Records a HandoverConfirmation for the scanned container, moves the JobContainer to ONBOARD / DELIVERED and lets the Job continue.");

        return group;
    }
}
