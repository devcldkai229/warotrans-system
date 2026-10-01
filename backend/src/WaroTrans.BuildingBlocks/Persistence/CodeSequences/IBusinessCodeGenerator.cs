namespace WaroTrans.BuildingBlocks.Persistence.CodeSequences;

public interface IBusinessCodeGenerator
{
    Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default);
    Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default);
    Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default);
    Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default);
    Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default);
    Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default);
    Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default);
    Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default);
    Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default);
}
