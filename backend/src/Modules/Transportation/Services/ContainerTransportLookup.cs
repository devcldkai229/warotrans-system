using Microsoft.EntityFrameworkCore;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Transportation.Services;

/// <summary>Lets Warehouse keep Containers that robots are already moving off its stock vouchers.</summary>
public sealed class ContainerTransportLookup(TransportationDbContext db) : IContainerTransportLookup
{
    private static readonly TransportRequestDetailStatus[] ActiveStatuses =
    [
        TransportRequestDetailStatus.PENDING,
        TransportRequestDetailStatus.QUEUED,
        TransportRequestDetailStatus.IN_PROGRESS
    ];

    public async Task<IReadOnlySet<Guid>> GetContainersInActiveTransportAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default)
    {
        if (containerIds.Count == 0)
        {
            return new HashSet<Guid>();
        }

        var busy = await db.TransportRequestDetails
            .AsNoTracking()
            .Where(d => containerIds.Contains(d.ContainerId) && ActiveStatuses.Contains(d.Status))
            .Select(d => d.ContainerId)
            .Distinct()
            .ToListAsync(cancellationToken);
        return busy.ToHashSet();
    }
}
