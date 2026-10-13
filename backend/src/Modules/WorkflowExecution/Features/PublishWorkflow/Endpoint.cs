using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.WorkflowExecution.Features.PublishWorkflow;

public static class PublishWorkflowEndpoint
{
    public static RouteGroupBuilder MapPublishWorkflow(this RouteGroupBuilder group)
    {
        group.MapPost("/workflows/{id:guid}/publish", async (
            Guid id,
            PublishWorkflowHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
