using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.IntegrationEventHandlers;

/// <summary>
/// JobContainer lifecycle (WorkflowExecution) → TransportRequestDetail status (match by RequestId + ContainerId),
/// then the Request status is re-aggregated from its Details (rules/02 "Request status aggregation").
/// A COMPLETED Detail is also reported to Warehouse so the Container's location and InventoryStock follow it.
/// </summary>
public sealed class JobContainerStatusChangedHandler(
    TransportationDbContext db,
    IContainerMovementRecorder movements,
    IIntegrationEventPublisher events,
    ILogger<JobContainerStatusChangedHandler> logger) : IIntegrationEventHandler<JobContainerStatusChanged>
{
    public async Task HandleAsync(JobContainerStatusChanged integrationEvent, CancellationToken cancellationToken = default)
    {
        var request = await db.TransportRequests
            .Include(r => r.Details)
            .FirstOrDefaultAsync(r => r.Id == integrationEvent.TransportRequestId, cancellationToken);
        var detail = request?.Details.FirstOrDefault(d => d.ContainerId == integrationEvent.ContainerId);
        if (request is null || detail is null)
        {
            logger.LogWarning(
                "No TransportRequestDetail for request {RequestId} container {ContainerId}",
                integrationEvent.TransportRequestId,
                integrationEvent.ContainerId);
            return;
        }

        TransportRequestDetailStatus? mapped = integrationEvent.Status switch
        {
            "ASSIGNED" or "ONBOARD" => TransportRequestDetailStatus.IN_PROGRESS,
            "DELIVERED" => TransportRequestDetailStatus.COMPLETED,
            "FAILED" => TransportRequestDetailStatus.FAILED,
            "CANCELLED" => TransportRequestDetailStatus.CANCELLED,
            _ => null
        };
        if (mapped is null || detail.Status == mapped)
        {
            return;
        }

        // WH-04: a container waiting for recovery after a cancel only leaves that state when its Job ends it
        // (delivered, failed or cancelled), never by being picked up again.
        if (detail.Status == TransportRequestDetailStatus.CANCEL_PENDING_RECOVERY && mapped == TransportRequestDetailStatus.IN_PROGRESS)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        detail.Status = mapped.Value;
        detail.UpdatedAt = now;
        request.ApplyDetailProgress(now);

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "TransportRequest {RequestCode}: container {ContainerId} → {DetailStatus}, request → {RequestStatus}",
            request.RequestCode,
            detail.ContainerId,
            detail.Status,
            request.Status);

        if (detail.Status == TransportRequestDetailStatus.COMPLETED)
        {
            await RecordDeliveryAsync(request.RequestCode, detail, cancellationToken);
        }

        await events.PublishAsync(TransportRequestEvents.Progressed(request, detail), cancellationToken);
    }

    /// <summary>
    /// Warehouse updates the Container and InventoryStock in its own transaction (rules/04). The Detail is already
    /// committed, so a failure here is logged rather than thrown back into the Job runtime.
    /// </summary>
    private async Task RecordDeliveryAsync(string requestCode, TransportRequestDetail detail, CancellationToken cancellationToken)
    {
        try
        {
            await movements.RecordDeliveredAsync(
                new ContainerDelivery(detail.ContainerId, detail.DestinationStorageLocationId, detail.DestinationLevelNo),
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(
                exception,
                "TransportRequest {RequestCode}: container {ContainerId} delivered but Warehouse stock was not updated",
                requestCode,
                detail.ContainerId);
        }
    }
}
