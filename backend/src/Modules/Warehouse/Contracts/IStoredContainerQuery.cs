namespace WaroTrans.Warehouse.Contracts;

/// <summary>For schedules (WH-09): the Containers of a product now STORED on a shelf, those that have waited longest first.</summary>
public interface IStoredContainerQuery
{
    Task<IReadOnlyList<StoredContainer>> GetStoredAsync(
        Guid productId,
        Guid storageLocationId,
        CancellationToken cancellationToken = default);
}

public sealed record StoredContainer(Guid Id, short? LevelNo);
