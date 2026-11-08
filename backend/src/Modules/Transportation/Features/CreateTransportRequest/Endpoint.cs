using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Transportation.Features.CreateTransportRequest;

public static class CreateTransportRequestEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/transport-requests", async (
            CreateTransportRequestRequest request,
            CreateTransportRequestHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/transportation/transport-requests/{response.Id}", response);
        })
        .RequirePermission(Permissions.TransportCreate)
        .Audited("transport_request.created", "REQUEST", null)
        .WithName("CreateTransportRequest")
        .WithSummary("Submit a TransportRequest with its Container movement Details")
        .WithDescription("Validates Warehouse, MapVersion, Endpoints, Containers and the selected PUBLISHED Workflow, then persists the request (SUBMITTED) and all Details (PENDING) atomically. Does not plan or create Jobs.");
    }
}
