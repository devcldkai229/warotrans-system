using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.WorkflowExecution.Features.CreateWorkflow;

public static class CreateWorkflowEndpoint
{
    public static RouteGroupBuilder MapCreateWorkflow(this RouteGroupBuilder group)
    {
        group.MapPost("/workflows", async (
            CreateWorkflowRequest request,
            IValidator<CreateWorkflowRequest> validator,
            CreateWorkflowHandler handler,
            CancellationToken cancellationToken) =>
        {
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/workflow-execution/workflows/{response.Id}", response);
        });

        return group;
    }
}
