using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.Transportation.Features.CreateTransportRequest;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Transportation.Services;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Transportation.Features.PreviewOutboundPick;

public sealed class OutboundPickHandler(TransportationDbContext db, IWarehouseModule warehouse, INavigationModule navigation)
{
    public async Task<OutboundPickResponse> HandleAsync(OutboundPickRequest request, CancellationToken ct)
    {
        var owner = await warehouse.GetWarehouseAsync(request.WarehouseId, ct);
        if (owner is null || !owner.IsActive)
            throw new NotFoundException("The warehouse was not found or is inactive.", "warehouse_not_found");
        var map = await navigation.GetMapVersionAsync(request.MapVersionId, ct);
        if (map is null || map.WarehouseId != request.WarehouseId || map.Status != MapStatus.PUBLISHED)
            throw new DomainValidationException("Select the warehouse's published map.", "outbound_pick_invalid_map");

        var endpoints = await navigation.GetEndpointsOnMapAsync(map.Id, ct);
        var gate = endpoints.FirstOrDefault(e => e.Id == request.DestinationEndpointId);
        if (gate is null || !gate.IsEnabled || !WarehouseGate.IsOutbound(gate.Code, gate.EndpointType.ToString()))
            throw new DomainValidationException("Select an enabled Outbound gate on the published map.", "outbound_pick_invalid_destination");

        var shelves = endpoints.Where(e => e.IsEnabled && e.EndpointType == EndpointType.WAYPOINT
                && !WarehouseGate.IsInbound(e.Code, e.EndpointType.ToString())
                && !WarehouseGate.IsOutbound(e.Code, e.EndpointType.ToString()))
            .Select(e => e.Id).ToArray();

        var busy = await TransportReservations.UnavailableContainers(db, request.WarehouseId).Distinct().ToArrayAsync(ct);
        var candidates = await warehouse.GetOutboundStockCandidatesAsync(
            request.WarehouseId, request.ProductId, shelves, busy, request.ContainerCount, ct);
        var items = candidates.Select((box, index) => new OutboundPickItem(box.Barcode, box.SourceStorageLocationCode,
            box.AdmittedAt, new CreateTransportRequestDetailRequest(index + 1, box.ContainerId, box.SourceStorageLocationId,
                box.SourceEndpointId, box.SourceLevelNo, null, request.DestinationEndpointId, null))).ToList();
        return new OutboundPickResponse(request.ContainerCount, items.Count == request.ContainerCount, items);
    }
}
