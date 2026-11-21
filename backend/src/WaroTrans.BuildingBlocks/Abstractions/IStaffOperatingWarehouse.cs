namespace WaroTrans.BuildingBlocks.Abstractions;

public interface IStaffOperatingWarehouse
{
    Task<Guid?> GetOperatingWarehouseIdAsync(CancellationToken cancellationToken);
}
