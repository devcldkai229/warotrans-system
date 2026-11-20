using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Transportation.Features.CloseTransportRequest;

public static class CloseTransportRequestEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/transport-requests/{id:guid}/cancel", async (
                Guid id,
                CloseTransportRequestRequest? body,
                HttpRequest http,
                CloseTransportRequestHandler handler,
                CancellationToken cancellationToken) =>
            {
                body ??= new CloseTransportRequestRequest(null);
                // The Idempotency-Key header wins over the body field, as for any retried HTTP call.
                if (http.Headers.TryGetValue("Idempotency-Key", out var header) && !string.IsNullOrWhiteSpace(header))
                {
                    body = body with { IdempotencyKey = header.ToString() };
                }

                return Results.Ok(await handler.CancelAsync(id, body, cancellationToken));
            })
            .RequirePermission(Permissions.TransportCancel)
            .Audited("transport_request.cancelled", "REQUEST", "id")
            .WithName("CancelTransportRequest")
            .WithSummary("Cancel a TransportRequest and its Jobs")
            .WithDescription("Idempotent (Idempotency-Key header or idempotencyKey). Starts a cancellation (GET .../cancellation follows it). Containers not picked up yet are cancelled (warehouse unchanged). A Job with containers on the robot is stopped and held; the request stays CANCELLING until that cargo is delivered or unloaded by scan. Delivered containers stay delivered. detailIds cancels only those details, before pickup (409 detail_already_picked_up).");

        endpoints.MapPost("/transport-requests/{id:guid}/reject", async (
                Guid id,
                CloseTransportRequestRequest? body,
                CloseTransportRequestHandler handler,
                CancellationToken cancellationToken) =>
            Results.Ok(await handler.RejectAsync(id, body ?? new CloseTransportRequestRequest(null), cancellationToken)))
            .RequirePermission(Permissions.TransportReject)
            .Audited("transport_request.rejected", "REQUEST", "id")
            .WithName("RejectTransportRequest")
            .WithSummary("Reject a TransportRequest before any of its Jobs ran")
            .WithDescription("Only SUBMITTED, or QUEUED while no Job has started. Needs a reason; the requester is notified. Idempotent.");
    }
}
