using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Transportation.Enums;

namespace WaroTrans.Transportation.Features.ListTransportRequests;

public static class ListTransportRequestsEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/transport-requests", async (
            Guid? warehouseId,
            string? status,
            string? search,
            Guid[]? ids,
            int? take,
            IValidator<ListTransportRequestsRequest> validator,
            ListTransportRequestsHandler handler,
            CancellationToken cancellationToken) =>
        {
            TransportRequestStatus? parsedStatus = null;
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<TransportRequestStatus>(status, ignoreCase: true, out var value))
                {
                    return Results.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["status"] = ["Status must be a valid TransportRequestStatus."]
                    });
                }

                parsedStatus = value;
            }

            var request = new ListTransportRequestsRequest(
                warehouseId,
                parsedStatus,
                search,
                take ?? 50,
                ids);
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Ok(response);
        })
        .RequirePermission(Permissions.TransportRead)
        .WithName("ListTransportRequests")
        .WithSummary("List TransportRequests")
        .WithDescription("Returns TransportRequests with enriched container and endpoint labels. Does not create Jobs. `ids` (repeat the parameter, at most 100) narrows the list to those requests, e.g. to turn the ids on a Job list into request codes.");
    }
}
