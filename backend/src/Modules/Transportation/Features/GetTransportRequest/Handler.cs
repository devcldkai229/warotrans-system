using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;
using StorageLocationSnapshot = WaroTrans.Warehouse.Contracts.StorageLocationSnapshot;

namespace WaroTrans.Transportation.Features.GetTransportRequest;

public sealed class GetTransportRequestHandler(
    TransportationDbContext dbContext,
    IWarehouseModule warehouseModule,
    INavigationModule navigationModule)
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
                        d.Status.ToString());
                })
                .ToList());
    }
}
