using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Transportation.Features.Cancellation;

/// <summary>TRN-03: preview a cancel, follow it, and resolve the cargo still on a robot (deliver or unload by scan).</summary>
public static class TransportCancellationEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/transport-requests/{id:guid}/cancel-preview", async (
                Guid id, TransportCancellationService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.PreviewAsync(id, cancellationToken)))
            .RequirePermission(Permissions.TransportRead)
            .WithName("PreviewTransportRequestCancel")
            .WithSummary("What cancelling this request would do now")
            .WithDescription("Counts delivered / on a robot / not picked up, per Job and robot, and which details can be cancelled alone. Read only; the cancel checks everything again.");

        endpoints.MapGet("/transport-requests/{id:guid}/cancellation", async (
                Guid id, TransportCancellationService service, CancellationToken cancellationToken) =>
            await service.GetAsync(id, cancellationToken) is { } cancellation ? Results.Ok(cancellation) : Results.NoContent())
            .RequirePermission(Permissions.TransportRead)
            .WithName("GetTransportRequestCancellation")
            .WithSummary("The request's latest cancellation and where it stands")
            .WithDescription("204 when the request was never cancelled. Status REQUESTED, STOPPING, RECOVERING, FINALIZED, or WAITING_ROBOT / MANUAL_INTERVENTION; one item per Job with its robot and containers.");

        endpoints.MapPost("/transport-requests/{id:guid}/cancellation/jobs/{jobId:guid}/handover", async (
                Guid id, Guid jobId, CancelHandoverBody body, TransportCancellationService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.HandOverAsync(id, jobId, body, cancellationToken)))
            .RequirePermission(Permissions.ContainerRecover)
            .Audited("transport_cancellation.handover", "REQUEST", "id")
            .WithName("HandOverCancelledCargo")
            .WithSummary("A container was taken off a stopped robot by hand and put on a shelf")
            .WithDescription("Scan required (scannedBarcode must be the container's label). The robot must hold still or be offline. The container leaves the Job and is RECOVERED on the shelf in Warehouse. Repeating it changes nothing. 409 robot_not_stopped, container_not_onboard, job_not_held.");

        endpoints.MapPost("/transport-requests/{id:guid}/cancellation/jobs/{jobId:guid}/deliver", async (
                Guid id, Guid jobId, TransportCancellationService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.DeliverAsync(id, jobId, cancellationToken)))
            .RequirePermission(Permissions.JobOperate)
            .Audited("transport_cancellation.deliver", "REQUEST", "id")
            .WithName("DeliverCancelledCargo")
            .WithSummary("Deliver the cargo on a stopped robot anyway")
            .WithDescription("Resumes the held Job; it only drops off what is on board (containers not picked up stay cancelled).");
    }
}
