using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Warehouse.Features.CreateContainer;

public static class CreateContainerEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/containers", async (
            CreateContainerRequest request,
            CreateContainerHandler handler,
            CreateContainerBatchHandler batchHandler,
            CancellationToken cancellationToken) =>
        {
            if (request.Groups is not null)
                return Results.Ok(await batchHandler.HandleAsync(request, cancellationToken));

            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/warehouse/containers/{response.Id}", response);
        })
        .RequirePermission(Permissions.ContainerCreate)
        .Audited("container.created", "CONTAINER", null)
        .Produces<CreateContainerResponse>(StatusCodes.Status201Created)
        .Produces<CreateContainerBatchResponse>(StatusCodes.Status200OK)
        .WithName("CreateContainer")
        .WithSummary("Create one Container or an atomic receiving batch")
        .WithDescription("Legacy single shape returns 201 and one Container. Groups selects atomic batch receiving (1..9999 boxes) and returns 200 with an idempotent receipt. Product and contents must be known first; neither shape posts inventory.");
    }
}
