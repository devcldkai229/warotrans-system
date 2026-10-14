using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListContainers;

public sealed class ListContainersHandler(WarehouseDbContext db)
{
    private static readonly ContainerStatus[] EligibleStatuses =
    [
        ContainerStatus.CREATED,
        ContainerStatus.PACKED,
        ContainerStatus.STORED
    ];

    public async Task<ListContainersResponse> HandleAsync(
        ListContainersRequest request,
        CancellationToken cancellationToken)
    {
        // Warehouse ownership is via current storage location. Containers without a location
        // (e.g. inbound CREATED) are included when they are not yet bound to another warehouse.
        var query = db.Containers
            .AsNoTracking()
            .Where(c =>
                c.CurrentStorageLocationId == null
                || (c.CurrentStorageLocation != null
                    && c.CurrentStorageLocation.WarehouseId == request.WarehouseId));

        if (request.EligibleOnly)
        {
            query = query.Where(c => EligibleStatuses.Contains(c.Status));
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            query = query.Where(c =>
                EF.Functions.ILike(c.Barcode, $"%{term}%")
                || (c.Product != null && EF.Functions.ILike(c.Product.Sku, $"%{term}%"))
                || (c.Product != null && EF.Functions.ILike(c.Product.Name, $"%{term}%"))
                || (c.SupplierPackageBarcode != null
                    && EF.Functions.ILike(c.SupplierPackageBarcode, $"%{term}%")));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(c => c.Barcode)
            .Take(request.Take)
            .Select(c => new ContainerListItemResponse(
                c.Id,
                c.Barcode,
                c.Status.ToString(),
                c.ProductId,
                c.Product != null ? c.Product.Sku : string.Empty,
                c.Product != null ? c.Product.Name : string.Empty,
                c.CurrentStorageLocationId,
                c.CurrentStorageLocation != null ? c.CurrentStorageLocation.Code : null,
                c.CurrentStorageLocation != null ? c.CurrentStorageLocation.EndpointId : (Guid?)null,
                c.CurrentLevelNo))
            .ToListAsync(cancellationToken);

        return new ListContainersResponse(items, total);
    }
}
