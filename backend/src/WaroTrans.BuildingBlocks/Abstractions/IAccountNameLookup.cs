namespace WaroTrans.BuildingBlocks.Abstractions;

/// <summary>Implemented by Identity: display names for the account ids other modules store as scalars (BOTH-06).</summary>
public interface IAccountNameLookup
{
    /// <returns>Name by account id; an account that no longer exists is simply missing.</returns>
    Task<IReadOnlyDictionary<Guid, string>> GetNamesAsync(
        IReadOnlyCollection<Guid> accountIds,
        CancellationToken cancellationToken = default);
}
