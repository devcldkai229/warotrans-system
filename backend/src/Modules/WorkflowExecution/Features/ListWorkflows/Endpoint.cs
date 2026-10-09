using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.WorkflowExecution.Features.ListWorkflows;

public static class ListWorkflowsEndpoint
{
    public static RouteGroupBuilder MapListWorkflows(this RouteGroupBuilder group)
    {
        group.MapGet("/workflows", async (
            string? code,
            string? status,
            ListWorkflowsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(code, status, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
