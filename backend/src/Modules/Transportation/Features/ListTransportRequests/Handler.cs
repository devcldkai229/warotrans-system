using Microsoft.EntityFrameworkCore;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Transportation.Features.ListTransportRequests;

public sealed class ListTransportRequestsHandler(
    TransportationDbContext dbContext,
    IWarehouseModule warehouseModule,
    INavigationModule navigationModule)
{
    public async Task<ListTransportRequestsResponse> HandleAsync(
        ListTransportRequestsRequest request,
        CancellationToken cancellationToken = default)
    {
        var query = dbContext.TransportRequests
            .AsNoTracking()
            .Include(r => r.Details)
            .AsQueryable();

        if (request.WarehouseId is { } warehouseId)
        {
            query = query.Where(r => r.WarehouseId == warehouseId);
        }

        if (request.Status is { } status)
        {
            query = query.Where(r => r.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            query = query.Where(r => EF.Functions.ILike(r.RequestCode, $"%{term}%"));
        }

        var total = await query.CountAsync(cancellationToken);
        var requests = await query
            .OrderByDescending(r => r.SubmittedAt)
            .Take(request.Take)
            .ToListAsync(cancellationToken);

        var lookups = await TransportRequestEnricher.LoadAsync(
            requests,
            warehouseModule,
            navigationModule,
            cancellationToken);

        var items = requests.Select(r => new TransportRequestListItemResponse(
            r.Id,
            r.RequestCode,
            r.Status.ToString(),
            r.WarehouseId,
            r.MapVersionId,
            r.WorkflowId,
            r.RequestedBy,
            r.Note,
            r.SubmittedAt,
            r.Details.Count,
            r.Details
                .OrderBy(d => d.SequenceNo)
                .Select(d =>
                {
                    lookups.Containers.TryGetValue(d.ContainerId, out var container);
                    lookups.Endpoints.TryGetValue(d.SourceEndpointId, out var source);
                    lookups.Endpoints.TryGetValue(d.DestinationEndpointId, out var destination);
                    return new TransportRequestListDetailSummary(
                        d.Id,
                        d.SequenceNo,
                        d.ContainerId,
                        container?.Barcode,
                        d.SourceEndpointId,
                        source?.Code,
                        d.DestinationEndpointId,
                        destination?.Code,
                        d.Status.ToString());
                })
                .ToList()))
            .ToList();

        return new ListTransportRequestsResponse(items, total);
    }
}
