using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.RecoverContainer;

public static class RecoverContainerEndpoint
{
    public static RouteGroupBuilder MapRecoverContainer(this RouteGroupBuilder group)
    {
        group.MapPost("/containers/{id:guid}/recover", async (
            Guid id,
            RecoverContainerRequest request,
            RecoverContainerHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, request, cancellationToken)))
        .RequirePermission(Permissions.ContainerRecover)
        .Audited("container.recovered", "CONTAINER", "id")
        .WithName("RecoverContainer")
        .WithSummary("Say which shelf a Container that lost its place (IN_TRANSIT, HOLD) is really on")
        .WithDescription(
            "Used after a failed or cancelled Job left cargo on the robot or off-shelf. Puts the Container on the shelf " +
            "level and adds it to InventoryStock. Refused with 409 while a Transport Request is still moving it.");

        return group;
    }
}
