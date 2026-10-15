using Microsoft.EntityFrameworkCore;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Services;

/// <summary>CHECK.REQUEST_ACTIVE for the Job engine: current TransportRequest status.</summary>
public sealed class TransportRequestActivityQuery(TransportationDbContext db) : ITransportRequestActivityQuery
{
    public async Task<string?> GetStatusAsync(Guid transportRequestId, CancellationToken cancellationToken = default)
    {
        var status = await db.TransportRequests.AsNoTracking()
            .Where(r => r.Id == transportRequestId)
            .Select(r => (Enums.TransportRequestStatus?)r.Status)
            .FirstOrDefaultAsync(cancellationToken);
        return status?.ToString();
    }
}
