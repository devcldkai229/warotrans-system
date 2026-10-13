using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Fleet.Features.IssueCancelCommand;

public static class IssueCancelCommandEndpoint
{
    public static RouteGroupBuilder MapIssueCancelCommand(this RouteGroupBuilder group)
    {
        group.MapPost("/robots/{id:guid}/commands/cancel", async (
            Guid id,
            IssueCancelCommandRequest? request,
            IssueCancelCommandHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(
                id,
                request ?? new IssueCancelCommandRequest(null),
                cancellationToken);
            return Results.Accepted($"/api/fleet/robots/{id}/commands/{response.CommandId}", response);
        });

        return group;
    }
}
