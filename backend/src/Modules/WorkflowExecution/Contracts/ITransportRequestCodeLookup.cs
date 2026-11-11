namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>Request codes for Job read models. Implemented by Transportation, as <see cref="ITransportRequestActivityQuery"/>.</summary>
public interface ITransportRequestCodeLookup
{
    Task<IReadOnlyDictionary<Guid, string>> GetCodesAsync(
        IReadOnlyCollection<Guid> transportRequestIds,
        CancellationToken cancellationToken = default);
}
