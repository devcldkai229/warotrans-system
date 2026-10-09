using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.WorkflowExecution.Features.UpdateWorkflow;

public static class UpdateWorkflowEndpoint
{
    public static RouteGroupBuilder MapUpdateWorkflow(this RouteGroupBuilder group)
    {
        group.MapPut("/workflows/{id:guid}", async (
            Guid id,
            UpdateWorkflowRequest request,
            IValidator<UpdateWorkflowRequest> validator,
            UpdateWorkflowHandler handler,
            CancellationToken cancellationToken) =>
        {
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
