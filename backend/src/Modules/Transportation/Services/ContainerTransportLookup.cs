using Microsoft.EntityFrameworkCore;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Transportation.Services;

/// <summary>Lets Warehouse keep Containers that robots are already moving off its stock vouchers.</summary>
public sealed class ContainerTransportLookup(TransportationDbContext db) : IContainerTransportLookup
{
    public async Task<IReadOnlySet<Guid>> GetContainersInActiveTransportAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default)
    {
        if (containerIds.Count == 0)
        {
            return new HashSet<Guid>();
        }

        var busy = await TransportReservations.ActiveDetails(db)
            .Where(d => containerIds.Contains(d.ContainerId))
            .Select(d => d.ContainerId)
            .Distinct()
            .ToListAsync(cancellationToken);
        return busy.ToHashSet();
    }
}
