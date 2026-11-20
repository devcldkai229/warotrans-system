using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Security;

internal sealed class StaffWorkZones(IdentityDbContext db) : IStaffWorkZones
{
    public async Task<StaffWorkZone?> GetAsync(Guid accountId, CancellationToken cancellationToken)
    {
        var zone = await db.Accounts.AsNoTracking()
            .Where(account => account.Id == accountId && account.Role == AccountRole.STAFF && account.Status == AccountStatus.ACTIVE)
            .Select(account => new { account.WorkZoneWarehouseId, account.WorkZoneCode })
            .SingleOrDefaultAsync(cancellationToken);
        return zone?.WorkZoneWarehouseId is { } warehouse && zone.WorkZoneCode is { } code ? new StaffWorkZone(warehouse, code) : null;
    }

    public async Task SetAsync(Guid accountId, StaffWorkZone? zone, CancellationToken cancellationToken)
    {
        var updated = await db.Accounts
            .Where(account => account.Id == accountId && account.Role == AccountRole.STAFF && account.Status == AccountStatus.ACTIVE)
            .ExecuteUpdateAsync(update => update.SetProperty(account => account.WorkZoneWarehouseId, zone == null ? null : zone.WarehouseId)
                .SetProperty(account => account.WorkZoneCode, zone == null ? null : zone.Code), cancellationToken);
        if (updated != 1)
            throw new AppException("An active Staff account is required to set its work zone.", 403, "staff_work_zone_forbidden");
    }

    public async Task<IReadOnlyList<Guid>> GetStaffInZonesAsync(
        Guid warehouseId, IReadOnlyCollection<string> codes, CancellationToken cancellationToken) =>
        await db.Accounts.AsNoTracking()
            .Where(account => account.Role == AccountRole.STAFF && account.Status == AccountStatus.ACTIVE
                && !account.MustChangePassword && account.WorkZoneWarehouseId == warehouseId
                && account.WorkZoneCode != null && codes.Contains(account.WorkZoneCode))
            .Select(account => account.Id).ToListAsync(cancellationToken);
}
