namespace WaroTrans.BuildingBlocks.Persistence.CodeSequences;

public interface IBusinessCodeGenerator
{
    Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default);
    Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default);
    Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default);
    Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default);
    Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default);
    Task<string> NextEdgeCodeAsync(string suffix, CancellationToken cancellationToken = default);
    Task<string> NextZoneCodeAsync(string suffix, CancellationToken cancellationToken = default);
    Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default);
    Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default);
    async Task<IReadOnlyList<string>> NextContainerCodesAsync(int count, DateOnly? day = null, CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(count, 1);
        var codes = new List<string>(count);
        for (var i = 0; i < count; i++) codes.Add(await NextContainerCodeAsync(day, cancellationToken));
        return codes;
    }

    Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default);
    Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default);
    Task<string> NextInboundVoucherCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default);
    Task<string> NextOutboundVoucherCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default);
}
