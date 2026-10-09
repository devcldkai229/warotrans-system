using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Fleet.Features.IssueNavigateCommand;

public static class IssueNavigateCommandEndpoint
{
    public static RouteGroupBuilder MapIssueNavigateCommand(this RouteGroupBuilder group)
    {
        group.MapPost("/robots/{id:guid}/commands/navigate", async (
            Guid id,
            IssueNavigateCommandRequest request,
            IValidator<IssueNavigateCommandRequest> validator,
            IssueNavigateCommandHandler handler,
            CancellationToken cancellationToken) =>
        {
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Accepted($"/api/fleet/robots/{id}/commands/{response.CommandId}", response);
        });

        return group;
    }
}
