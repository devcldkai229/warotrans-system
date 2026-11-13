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
            string? voucherType,
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
                status,
                voucherType);
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
            "`status` narrows the list to one container status; `voucherType` (INBOUND / OUTBOUND) to Containers on a CONFIRMED " +
            "voucher of that type, newest voucher first; `skip` / `take` page it and `total` counts every match. Each item tells " +
            "its latest voucher (not cancelled).");

        return group;
    }
}
