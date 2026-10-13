using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.WorkflowExecution.Features.CreateWorkflowVersion;

public static class CreateWorkflowVersionEndpoint
{
    public static RouteGroupBuilder MapCreateWorkflowVersion(this RouteGroupBuilder group)
    {
        group.MapPost("/workflows/{id:guid}/versions", async (
            Guid id,
            CreateWorkflowVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Created($"/api/workflow-execution/workflows/{response.Id}", response);
        });

        return group;
    }
}
