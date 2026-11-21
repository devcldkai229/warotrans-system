using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;
using StorageLocationSnapshot = WaroTrans.Warehouse.Contracts.StorageLocationSnapshot;

namespace WaroTrans.Transportation.Features.GetTransportRequest;

public sealed class GetTransportRequestHandler(
    TransportationDbContext dbContext,
    IWarehouseModule warehouseModule,
    INavigationModule navigationModule,
    ITransportRequestJobControl jobControl,
    ICurrentUser currentUser,
    IAccountNameLookup accounts)
{
    public async Task<GetTransportRequestResponse> HandleAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var request = await dbContext.TransportRequests
            .AsNoTracking()
            .Include(r => r.Details)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new NotFoundException(
                $"TransportRequest '{id}' was not found.",
                "transport_request_not_found");

        var lookups = await TransportRequestEnricher.LoadAsync(
            [request],
            warehouseModule,
            navigationModule,
            cancellationToken);

        var jobs = (await jobControl.GetJobsAsync([request.Id], cancellationToken)).GetValueOrDefault(request.Id) ?? [];

        // Read the producer queue first. If a handover leaves it between queries, its posting is already durable.
        var pendingHandovers = (await jobControl.GetPendingStockHandoversAsync(request.Id, cancellationToken))
            .OrderByDescending(handover => handover.ConfirmedAt)
            .ToLookup(handover => handover.ContainerId);
        var postings = (await dbContext.StockPostings
                .AsNoTracking()
                .Where(p => p.TransportRequestId == request.Id)
                .OrderByDescending(p => p.CreatedAt)
                .ThenByDescending(p => p.Id)
                .Select(p => new
                {
                    p.ContainerId,
                    p.Type,
                    Sync = new WarehouseStockPostingResponse(
                        p.JobId,
                        p.PostedAt != null ? "POSTED" : p.Attempts > 0 ? "RETRYING" : "PENDING",
                        p.CreatedAt,
                        p.PostedAt,
                        p.NextAttemptAt)
                })
                .ToListAsync(cancellationToken))
            .ToLookup(p => p.ContainerId);

        var names = await accounts.GetNamesAsync([request.RequestedBy], cancellationToken);

        return new GetTransportRequestResponse(
            request.Id,
            request.RequestCode,
            request.Status.ToString(),
            request.WarehouseId,
            request.MapVersionId,
            request.WorkflowId,
            request.PlanSchemaVersion,
            request.RequestedBy,
            request.Note,
            request.WorkflowInputs ?? [],
            request.SubmittedAt,
            request.QueuedAt,
            request.CompletedAt,
            request.FailureCode,
            request.FailureMessage,
            request.Details
                .OrderBy(d => d.SequenceNo)
                .Select(d =>
                {
                    lookups.Containers.TryGetValue(d.ContainerId, out var container);
                    StorageLocationSnapshot? sourceLocation = null;
                    StorageLocationSnapshot? destinationLocation = null;
                    if (d.SourceStorageLocationId is { } sourceLocationId)
                    {
                        lookups.StorageLocations.TryGetValue(sourceLocationId, out sourceLocation);
                    }

                    if (d.DestinationStorageLocationId is { } destinationLocationId)
                    {
                        lookups.StorageLocations.TryGetValue(destinationLocationId, out destinationLocation);
                    }

                    lookups.Endpoints.TryGetValue(d.SourceEndpointId, out var sourceEndpoint);
                    lookups.Endpoints.TryGetValue(d.DestinationEndpointId, out var destinationEndpoint);

                    var containerPostings = postings[d.ContainerId];
                    var pending = pendingHandovers[d.ContainerId];
                    var pickup = containerPostings.FirstOrDefault(p => p.Type == StockPostingType.PICKUP)?.Sync
                        ?? WaitingForPosting(pending.FirstOrDefault(handover => handover.IsPickup));
                    var delivery = containerPostings.FirstOrDefault(p => p.Type == StockPostingType.DELIVERY)?.Sync
                        ?? WaitingForPosting(pending.FirstOrDefault(handover => !handover.IsPickup));

                    return new TransportRequestDetailItemResponse(
                        d.Id,
                        d.SequenceNo,
                        d.ContainerId,
                        container?.Barcode,
                        d.SourceStorageLocationId,
                        sourceLocation?.Code,
                        d.SourceEndpointId,
                        sourceEndpoint?.Code,
                        sourceEndpoint?.Name,
                        d.SourceLevelNo,
                        d.DestinationStorageLocationId,
                        destinationLocation?.Code,
                        d.DestinationEndpointId,
                        destinationEndpoint?.Code,
                        destinationEndpoint?.Name,
                        d.DestinationLevelNo,
                        d.Status.ToString(),
                        pickup is null && delivery is null ? null : new WarehouseHandoverSyncResponse(pickup, delivery));
                })
                .ToList(),
            request.CancelledBy,
            request.CancelReason,
            request.CancelRequestedAt,
            request.RejectedBy,
            request.RejectReason,
            request.RejectedAt,
            jobs,
            TransportRequestActionPolicy.Evaluate(request, jobs, currentUser.Can),
            names.GetValueOrDefault(request.RequestedBy));
    }

    private static WarehouseStockPostingResponse? WaitingForPosting(PendingStockHandover? handover) => handover is null
        ? null
        : new(handover.JobId, handover.NextAttemptAt.HasValue ? "RETRYING" : "PENDING",
            handover.ConfirmedAt, null, handover.NextAttemptAt);
}
