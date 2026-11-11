using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Transportation.Services;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.IntegrationEventHandlers;

/// <summary>
/// JobContainer lifecycle (WorkflowExecution) → TransportRequestDetail status (match by RequestId + ContainerId),
/// then the Request status is re-aggregated from its Details (rules/02 "Request status aggregation").
/// A handover (ONBOARD, DELIVERED) is also queued for Warehouse in the same transaction, so the Container's location and
/// InventoryStock follow it (WH-01) even if posting fails the first time.
/// </summary>
public sealed class JobContainerStatusChangedHandler(
    TransportationDbContext db,
    StockPostingProcessor postings,
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
        var now = DateTimeOffset.UtcNow;

        // Before the early returns: ASSIGNED and ONBOARD both map to IN_PROGRESS, but only ONBOARD moves stock.
        var posting = await QueuePostingAsync(integrationEvent, detail, now, cancellationToken);

        // WH-04: a container waiting for recovery after a cancel only leaves that state when its Job ends it
        // (delivered, failed or cancelled), never by being picked up again.
        var detailChanges = mapped is not null
            && detail.Status != mapped
            && !(detail.Status == TransportRequestDetailStatus.CANCEL_PENDING_RECOVERY && mapped == TransportRequestDetailStatus.IN_PROGRESS);

        if (detailChanges)
        {
            detail.Status = mapped!.Value;
            detail.UpdatedAt = now;
            request.ApplyDetailProgress(now);
        }
        else if (posting is null)
        {
            return;
        }

        await db.SaveChangesAsync(cancellationToken);

        if (posting is not null)
        {
            await postings.PostNowAsync(posting, cancellationToken);
        }

        if (!detailChanges)
        {
            return;
        }

        logger.LogInformation(
            "TransportRequest {RequestCode}: container {ContainerId} → {DetailStatus}, request → {RequestStatus}",
            request.RequestCode,
            detail.ContainerId,
            detail.Status,
            request.Status);

        await events.PublishAsync(TransportRequestEvents.Progressed(request, detail), cancellationToken);
    }

    /// <returns>The new posting, or null when this event moves no stock or was queued before.</returns>
    private async Task<StockPosting?> QueuePostingAsync(
        JobContainerStatusChanged integrationEvent,
        TransportRequestDetail detail,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        StockPostingType? type = integrationEvent.Status switch
        {
            "ONBOARD" => StockPostingType.PICKUP,
            "DELIVERED" => StockPostingType.DELIVERY,
            _ => null
        };
        if (type is null)
        {
            return null;
        }

        var key = $"{integrationEvent.JobId:N}:{detail.ContainerId:N}:{type}";
        if (await db.StockPostings.AnyAsync(p => p.Key == key, cancellationToken))
        {
            return null;
        }

        var posting = new StockPosting
        {
            Id = Guid.NewGuid(),
            Key = key,
            Type = type.Value,
            ContainerId = detail.ContainerId,
            JobId = integrationEvent.JobId,
            TransportRequestId = detail.TransportRequestId,
            DestinationStorageLocationId = detail.DestinationStorageLocationId,
            DestinationLevelNo = detail.DestinationLevelNo,
            CreatedAt = now
        };
        db.StockPostings.Add(posting);
        return posting;
    }
}
