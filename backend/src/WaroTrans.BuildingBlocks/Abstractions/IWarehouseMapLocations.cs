namespace WaroTrans.BuildingBlocks.Abstractions;

public sealed record WarehouseMapLocation(Guid WarehouseId, string Code);

public interface IWarehouseMapLocations
{
    Task<WarehouseMapLocation?> FindPublishedLocationAsync(
        Guid mapVersionId, Guid? edgeId, Guid? zoneId, Guid? endpointId, CancellationToken cancellationToken);
}

public interface IWarehouseRobotLookup
{
    Task<IReadOnlyList<Guid>> GetWarehousesAsync(IReadOnlyCollection<Guid> robotIds, CancellationToken cancellationToken);
}
