using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Features.QueueTransportRequest;

/// <summary>
/// Persisted TransportRequest + Details → snapshot → Job planning → Job runtime provisioning → QUEUED.
/// Safe to call again: provisioning is idempotent per (TransportRequestId, BatchKey).
/// </summary>
public sealed class QueueTransportRequestHandler(
    TransportationDbContext dbContext,
    IJobBatchPlanner jobBatchPlanner,
    IJobRuntimeProvisioner jobRuntimeProvisioner,
    ILogger<QueueTransportRequestHandler> logger)
{
    public async Task<QueueTransportRequestResponse> HandleAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var transportRequest = await dbContext.TransportRequests
            .Include(r => r.Details)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new NotFoundException($"TransportRequest '{id}' was not found.", "transport_request_not_found");

        if (transportRequest.Status is not (TransportRequestStatus.SUBMITTED or TransportRequestStatus.QUEUED))
        {
            throw new ConflictException(
                $"TransportRequest '{transportRequest.RequestCode}' cannot be queued from status {transportRequest.Status}.",
                "transport_request_not_queueable");
        }

        var snapshot = TransportRequestSnapshotMapper.ToExecutionSnapshot(transportRequest);
        var batches = jobBatchPlanner.Plan(snapshot);

        // Committed by WorkflowExecution in its own transaction. If the status update below fails,
        // calling queue again returns the same Jobs (same ProvisioningKey) and retries the update.
        var provisioned = await jobRuntimeProvisioner.ProvisionAsync(snapshot, batches, cancellationToken);

        if (transportRequest.Status == TransportRequestStatus.SUBMITTED)
        {
            var now = DateTimeOffset.UtcNow;
            transportRequest.Status = TransportRequestStatus.QUEUED;
            transportRequest.QueuedAt = now;
            transportRequest.UpdatedAt = now;
            foreach (var detail in transportRequest.Details)
            {
                detail.Status = TransportRequestDetailStatus.QUEUED;
                detail.UpdatedAt = now;
            }

            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "TransportRequest {TransportRequestId} ({RequestCode}) queued into {JobCount} job(s)",
                transportRequest.Id,
                transportRequest.RequestCode,
                provisioned.Jobs.Count);
        }

        return new QueueTransportRequestResponse(
            transportRequest.Id,
            transportRequest.RequestCode,
            transportRequest.Status.ToString(),
            transportRequest.QueuedAt,
            provisioned.Jobs
                .Select(j => new QueuedJobResponse(
                    j.JobId,
                    j.JobNo,
                    j.BatchKey,
                    j.JobContainerCount,
                    j.JobTaskCount,
                    j.JobStepCount))
                .ToList());
    }
}
