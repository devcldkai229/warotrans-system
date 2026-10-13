using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.WorkflowExecution.Features.GetWorkflowRequestInputSchema;

public static class GetWorkflowRequestInputSchemaEndpoint
{
    public static RouteGroupBuilder MapGetWorkflowRequestInputSchema(this RouteGroupBuilder group)
    {
        group.MapGet("/workflows/{id:guid}/request-input-schema", async (
            Guid id,
            GetWorkflowRequestInputSchemaHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
