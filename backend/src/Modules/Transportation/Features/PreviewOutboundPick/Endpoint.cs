using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Transportation.Features.PreviewOutboundPick;

public static class PreviewOutboundPickEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/transport-requests/outbound-pick-preview", async (
            OutboundPickRequest request,
            IValidator<OutboundPickRequest> validator,
            OutboundPickHandler handler,
            CancellationToken ct) =>
        {
            await validator.ValidateAndThrowAsync(request, ct);
            return Results.Ok(await handler.HandleAsync(request, ct));
        })
        .RequirePermission(Permissions.TransportCreate)
        .WithName("PreviewOutboundPick")
        .WithSummary("Preview the oldest available Containers of a Product for an outbound Transport Request");
}
