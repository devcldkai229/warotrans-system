using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.ListContainers;

public static class ListContainersEndpoint
{
    public static RouteGroupBuilder MapListContainers(this RouteGroupBuilder group)
    {
        group.MapGet("/containers", async (
            Guid warehouseId,
            string? search,
            bool? eligibleOnly,
            int? take,
            int? skip,
            string? status,
            IValidator<ListContainersRequest> validator,
            ListContainersHandler handler,
            CancellationToken cancellationToken) =>
        {
            var request = new ListContainersRequest(
                warehouseId,
                search,
                eligibleOnly ?? true,
                take ?? 50,
                skip ?? 0,
                status);
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Ok(response);
        })
        .RequirePermission(Permissions.WarehouseRead)
        .WithName("ListContainers")
        .WithSummary("List containers for a warehouse")
        .WithDescription(
            "Returns containers scoped to a warehouse via their current storage location. " +
            "Containers without a location (inbound) are included. Defaults to eligible statuses only. " +
            "`status` narrows the list to one container status; `skip` / `take` page it and `total` counts every match.");

        return group;
    }
}
