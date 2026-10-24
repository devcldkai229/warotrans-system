using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.IntegrationEventHandlers;

/// <summary>
/// JobContainer lifecycle (WorkflowExecution) → TransportRequestDetail status (match by RequestId + ContainerId),
/// then the Request status is re-aggregated from its Details (rules/02 "Request status aggregation").
/// </summary>
public sealed class JobContainerStatusChangedHandler(
    TransportationDbContext db,
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

        await events.PublishAsync(
            new TransportRequestProgressed(
                request.Id,
                request.RequestCode,
                request.Status,
                request.Details.Count,
                request.Details.Count(d => d.Status == TransportRequestDetailStatus.COMPLETED),
                request.Details.Count(d => d.Status == TransportRequestDetailStatus.FAILED)),
            cancellationToken);
    }
}
