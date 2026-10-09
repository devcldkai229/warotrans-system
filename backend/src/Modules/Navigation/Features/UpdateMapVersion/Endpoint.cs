using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.UpdateMapVersion;

public static class UpdateMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPut("/maps/{id:guid}", async (
            Guid id,
            UpdateMapVersionRequest request,
            UpdateMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("UpdateMapVersion")
        .WithSummary("Update a draft map version")
        .WithDescription("Updates metadata and grid origin parameters of a MapVersion. Only allowed for DRAFT map versions.");
    }
}
