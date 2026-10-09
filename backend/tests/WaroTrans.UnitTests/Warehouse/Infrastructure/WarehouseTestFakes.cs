using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;

namespace WaroTrans.UnitTests.Warehouse.Infrastructure;

public sealed class FakeCurrentUser(Guid? accountId = null, string? username = "testuser") : ICurrentUser
{
    public Guid? AccountId { get; set; } = accountId ?? Guid.NewGuid();
    public string? Username { get; set; } = username;
    public bool IsAuthenticated => true;
}

public sealed class FakeBusinessCodeGenerator(string containerCode = "CTN-20261006-000001") : IBusinessCodeGenerator
{
    public string ContainerCodeToReturn { get; set; } = containerCode;

    public Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult("WH-001");

    public Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
        Task.FromResult($"CAT-{suffix}");

    public Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default) =>
        Task.FromResult($"SKU-{prefix}-000001");

    public Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default) =>
        Task.FromResult($"MAP-{warehouseCode}-V{versionNo:000}");

    public Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
        Task.FromResult($"EP-{suffix}");

    public Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult("RBT-001");

    public Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult(ContainerCodeToReturn);

    public Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult("REQ-20261006-000001");

    public Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult("JOB-20261006-000001");
}
