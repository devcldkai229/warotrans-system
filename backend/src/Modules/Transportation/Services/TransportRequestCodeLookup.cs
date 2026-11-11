using Microsoft.EntityFrameworkCore;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Services;

public sealed class TransportRequestCodeLookup(TransportationDbContext db) : ITransportRequestCodeLookup
{
    public async Task<IReadOnlyDictionary<Guid, string>> GetCodesAsync(
        IReadOnlyCollection<Guid> transportRequestIds,
        CancellationToken cancellationToken = default) =>
        await db.TransportRequests.AsNoTracking()
            .Where(r => transportRequestIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => r.RequestCode, cancellationToken);
}
