namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>
/// Answers the CHECK.REQUEST_ACTIVE condition. Implemented by Transportation (which owns
/// TransportRequest status). Declared here because Transportation already depends on
/// WorkflowExecution contracts, so WorkflowExecution must not reference Transportation.
/// </summary>
public interface ITransportRequestActivityQuery
{
    /// <returns>Status name, or null when the request does not exist.</returns>
    Task<string?> GetStatusAsync(Guid transportRequestId, CancellationToken cancellationToken = default);

    /// <summary>True while the request may still be executed (not cancelled / rejected / failed / completed).</summary>
    static bool IsActive(string? status) =>
        status is not null and not ("CANCELLED" or "REJECTED" or "FAILED" or "COMPLETED");
}
