using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.ListRobots;

public static class ListRobotsEndpoint
{
    public static RouteGroupBuilder MapListRobots(this RouteGroupBuilder group)
    {
        group.MapGet("/robots", async (
            Guid? warehouseId,
            RobotStatus? status,
            bool? isEnabled,
            string? search,
            int? skip,
            int? take,
            IValidator<ListRobotsRequest> validator,
            ListRobotsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var request = new ListRobotsRequest(
                warehouseId,
                status,
                isEnabled,
                search,
                skip ?? 0,
                take ?? 50);

            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
