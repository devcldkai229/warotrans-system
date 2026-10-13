using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.WorkflowExecution.Features.GetWorkflow;

public static class GetWorkflowEndpoint
{
    public static RouteGroupBuilder MapGetWorkflow(this RouteGroupBuilder group)
    {
        group.MapGet("/workflows/{id:guid}", async (
            Guid id,
            GetWorkflowHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
