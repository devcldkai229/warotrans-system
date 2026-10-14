using WaroTrans.Navigation.Contracts;
using WaroTrans.Transportation.Entities;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Transportation.Features.Shared;

/// <summary>
/// Loads label snapshots for TransportRequest Details through public module contracts.
/// </summary>
public static class TransportRequestEnricher
{
    public static async Task<EnrichedLookups> LoadAsync(
        IReadOnlyCollection<TransportRequest> requests,
        IWarehouseModule warehouseModule,
        INavigationModule navigationModule,
        CancellationToken cancellationToken)
    {
        var containerIds = new HashSet<Guid>();
        var locationIds = new HashSet<Guid>();
        var endpointIds = new HashSet<Guid>();

        foreach (var request in requests)
        {
            foreach (var detail in request.Details)
            {
                containerIds.Add(detail.ContainerId);
                if (detail.SourceStorageLocationId is { } sourceLocation)
                {
                    locationIds.Add(sourceLocation);
                }

                if (detail.DestinationStorageLocationId is { } destinationLocation)
                {
                    locationIds.Add(destinationLocation);
                }

                endpointIds.Add(detail.SourceEndpointId);
                endpointIds.Add(detail.DestinationEndpointId);
            }
        }

        var containers = (await warehouseModule.GetContainersAsync(containerIds, cancellationToken))
            .ToDictionary(c => c.Id);
        var locations = (await warehouseModule.GetStorageLocationsAsync(locationIds, cancellationToken))
            .ToDictionary(l => l.Id);
        var endpoints = (await navigationModule.GetEndpointsAsync(endpointIds, cancellationToken))
            .ToDictionary(e => e.Id);

        return new EnrichedLookups(containers, locations, endpoints);
    }

    public sealed record EnrichedLookups(
        IReadOnlyDictionary<Guid, ContainerSnapshot> Containers,
        IReadOnlyDictionary<Guid, StorageLocationSnapshot> StorageLocations,
        IReadOnlyDictionary<Guid, EndpointSnapshot> Endpoints);
}
