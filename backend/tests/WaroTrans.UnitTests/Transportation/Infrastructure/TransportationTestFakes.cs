using Microsoft.EntityFrameworkCore;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.UnitTests.Transportation.Infrastructure;

public static class TransportationTestDbContextFactory
{
    public static TransportationDbContext Create(string dbName)
    {
        var options = new DbContextOptionsBuilder<TransportationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new TransportationDbContext(options);
    }
}

public sealed class FakeWarehouseModule : IWarehouseModule
{
    public Dictionary<Guid, WarehouseSnapshot> Warehouses { get; } = [];
    public Dictionary<Guid, ContainerSnapshot> Containers { get; } = [];

    public Task<WarehouseSnapshot?> GetWarehouseAsync(Guid warehouseId, CancellationToken cancellationToken = default) =>
        Task.FromResult(Warehouses.GetValueOrDefault(warehouseId));

    public Task<IReadOnlyList<ContainerSnapshot>> GetContainersAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<ContainerSnapshot>>(
            containerIds.Where(Containers.ContainsKey).Select(id => Containers[id]).ToList());
}

public sealed class FakeNavigationModule : INavigationModule
{
    public Dictionary<Guid, MapVersionSnapshot> MapVersions { get; } = [];
    public Dictionary<Guid, EndpointSnapshot> Endpoints { get; } = [];

    public Task<MapVersionSnapshot?> GetMapVersionAsync(Guid mapVersionId, CancellationToken cancellationToken = default) =>
        Task.FromResult(MapVersions.GetValueOrDefault(mapVersionId));

    public Task<IReadOnlyList<EndpointSnapshot>> GetEndpointsAsync(
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<EndpointSnapshot>>(
            endpointIds.Where(Endpoints.ContainsKey).Select(id => Endpoints[id]).ToList());
}

/// <summary>
/// Records the snapshot it receives; throws <see cref="ExceptionToThrow"/> when set.
/// </summary>
public sealed class RecordingWorkflowRequestValidator : IWorkflowRequestValidator
{
    public TransportRequestExecutionSnapshot? ReceivedSnapshot { get; private set; }
    public Guid? ReceivedWorkflowId { get; private set; }
    public Exception? ExceptionToThrow { get; set; }

    public Task ValidateAsync(
        Guid workflowId,
        TransportRequestExecutionSnapshot request,
        CancellationToken cancellationToken = default)
    {
        ReceivedWorkflowId = workflowId;
        ReceivedSnapshot = request;
        return ExceptionToThrow is null ? Task.CompletedTask : Task.FromException(ExceptionToThrow);
    }
}
