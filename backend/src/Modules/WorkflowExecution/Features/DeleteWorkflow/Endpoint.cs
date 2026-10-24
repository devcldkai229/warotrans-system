using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.WorkflowExecution.Features.DeleteWorkflow;

public static class DeleteWorkflowEndpoint
{
    public static RouteGroupBuilder MapDeleteWorkflow(this RouteGroupBuilder group)
    {
        group.MapDelete("/workflows/{id:guid}", async (
            Guid id,
            DeleteWorkflowHandler handler,
            CancellationToken cancellationToken) =>
        {
            await handler.HandleAsync(id, cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeleteWorkflow")
        .WithSummary("Delete a Workflow version")
        .WithDescription(
            "Removes one Workflow version (DRAFT or PUBLISHED) with its tasks and steps. " +
            "Returns 409 workflow_in_use when a Job or TransportRequest was created from it.");

        return group;
    }
}
