using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.ListStorageLocations;

public static class ListStorageLocationsEndpoint
{
    public static RouteGroupBuilder MapListStorageLocations(this RouteGroupBuilder group)
    {
        group.MapGet("/storage-locations", async (
            Guid warehouseId,
            bool? activeOnly,
            IValidator<ListStorageLocationsRequest> validator,
            ListStorageLocationsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var request = new ListStorageLocationsRequest(warehouseId, activeOnly ?? true);
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("ListStorageLocations")
        .WithSummary("List storage locations for a warehouse")
        .WithDescription("Returns storage locations for Admin Transport Request composer selectors.");

        return group;
    }
}
