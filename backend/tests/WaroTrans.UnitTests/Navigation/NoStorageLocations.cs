using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.UnitTests.Navigation;

/// <summary>A warehouse without storage locations, for the Navigation handlers that ask about them.</summary>
internal sealed class NoStorageLocations : IEndpointStorageLocations
{
    public Task<IReadOnlyList<EndpointStorageLocation>> GetByEndpointsAsync(
        Guid warehouseId, IReadOnlyCollection<Guid> endpointIds, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<EndpointStorageLocation>>([]);

    public Task<IReadOnlyList<string>> GetTakenCodesAsync(
        Guid warehouseId, IReadOnlyCollection<string> codes, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<string>>([]);

    public Task<IReadOnlyList<EndpointStorageLocation>> CreateAsync(
        Guid warehouseId, IReadOnlyList<PlannedStorageLocation> planned, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<EndpointStorageLocation>>([]);
}
