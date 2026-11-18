using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Features.Shared;

internal static class OutboundStaging
{
    public static async Task EnsureEligibleAsync(IMapEndpointCatalog map, Guid warehouseId, IReadOnlyCollection<Container> containers, CancellationToken ct)
    {
        var gates = (await map.GetPublishedEndpointsAsync(warehouseId, ct))
            .Where(e => e.IsEnabled && WarehouseGate.IsOutbound(e.Code, e.EndpointType))
            .Select(e => e.Id)
            .ToHashSet();

        foreach (var box in containers)
        {
            if (box.Status != ContainerStatus.STAGED_OUTBOUND || box.WarehouseId != warehouseId
                || box.CurrentEndpointId is not { } gateId || !gates.Contains(gateId)
                || box.InventoryStorageLocationId is null || box.InventoryLevelNo is null)
                throw new DomainValidationException(
                    $"Container '{box.Barcode}' must be staged at an enabled Outbound gate of this warehouse.",
                    "voucher_container_not_at_outbound");
        }
    }
}
