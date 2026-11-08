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
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/warehouse/containers/{response.Id}", response);
        })
        .RequirePermission(Permissions.ContainerCreate)
        .Audited("container.created", "CONTAINER", null)
        .WithName("CreateContainer")
        .WithSummary("Receive goods and create a WaroTrans Container")
        .WithDescription("Creates a new internal WaroTrans Container with auto-generated barcode CTN-YYYYMMDD-SEQ6.");
    }
}
