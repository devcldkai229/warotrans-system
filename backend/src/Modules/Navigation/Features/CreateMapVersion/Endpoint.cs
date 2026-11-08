using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Navigation.Features.CreateMapVersion;

public static class CreateMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/warehouses/{warehouseId:guid}/maps", async (
            Guid warehouseId,
            CreateMapVersionRequest request,
            CreateMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(warehouseId, request, cancellationToken);
            return Results.Created($"/api/navigation/maps/{response.Id}", response);
        })
        .RequirePermission(Permissions.MapWrite)
        .Audited("map.created", "MAP", null)
        .WithName("CreateMapVersion")
        .WithSummary("Create a draft map version (metadata)")
        .WithDescription(
            "Creates a DRAFT MapVersion without importing ROS files. " +
            "Omit MapUri/MapYamlUri/PreviewImageUri to store pending:// placeholders until Import uploads assets (Local or S3).");
    }
}
