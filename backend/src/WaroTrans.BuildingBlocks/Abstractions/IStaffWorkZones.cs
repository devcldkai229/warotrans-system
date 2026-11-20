namespace WaroTrans.BuildingBlocks.Abstractions;

public sealed record StaffWorkZone(Guid WarehouseId, string Code);

public interface IStaffWorkZones
{
    Task<StaffWorkZone?> GetAsync(Guid accountId, CancellationToken cancellationToken);
    Task SetAsync(Guid accountId, StaffWorkZone? zone, CancellationToken cancellationToken);
    Task<IReadOnlyList<Guid>> GetStaffInZonesAsync(Guid warehouseId, IReadOnlyCollection<string> codes, CancellationToken cancellationToken);
}
