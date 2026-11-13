using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.UnitTests.Warehouse.Infrastructure;

public sealed class FakeCurrentUser(
    Guid? accountId = null,
    string? username = "testuser",
    string? role = "ADMIN") : ICurrentUser
{
    public Guid? AccountId { get; set; } = accountId ?? Guid.NewGuid();
    public string? Username { get; set; } = username;
    public string? Role { get; set; } = role;
    public bool IsAuthenticated => true;
}

/// <summary>Containers listed in <see cref="Moving"/> count as being on an open Transport Request.</summary>
public sealed class FakeContainerTransportLookup : IContainerTransportLookup
{
    public HashSet<Guid> Moving { get; } = [];

    public Task<IReadOnlySet<Guid>> GetContainersInActiveTransportAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlySet<Guid>>(containerIds.Where(Moving.Contains).ToHashSet());
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

    public Task<string> NextEdgeCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
        Task.FromResult("EDGE-001");

    public Task<string> NextZoneCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
        Task.FromResult($"ZONE-{suffix}");

    public Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult("RBT-001");

    public Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult(ContainerCodeToReturn);

    public int ContainerBatchCalls { get; private set; }
    private int _containerSequence;
    public Task<IReadOnlyList<string>> NextContainerCodesAsync(int count, DateOnly? day = null, CancellationToken cancellationToken = default)
    {
        ContainerBatchCalls++;
        var start = Interlocked.Add(ref _containerSequence, count) - count + 1;
        return Task.FromResult<IReadOnlyList<string>>(Enumerable.Range(start, count).Select(i => $"CTN-20261006-{i:D6}").ToArray());
    }

    public Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult("REQ-20261006-000001");

    public Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult("JOB-20261006-000001");

    public Task<string> NextInboundVoucherCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult("PN-20261006-000001");

    public Task<string> NextOutboundVoucherCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult("PX-20261006-000001");
}
