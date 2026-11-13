using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Services;

public sealed class EndpointStorageLocations(
    WarehouseDbContext dbContext,
    ILogger<EndpointStorageLocations> logger) : IEndpointStorageLocations
{
    private const int MaxNameLength = 100;

    public async Task<IReadOnlyList<EndpointStorageLocation>> GetByEndpointsAsync(
        Guid warehouseId,
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default)
    {
        if (endpointIds.Count == 0)
        {
            return [];
        }

        return await dbContext.StorageLocations
            .AsNoTracking()
            .Where(l => l.WarehouseId == warehouseId && endpointIds.Contains(l.EndpointId))
            .Select(l => new EndpointStorageLocation(l.Id, l.EndpointId, l.Code, l.Name, l.IsActive))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<string>> GetTakenCodesAsync(
        Guid warehouseId,
        IReadOnlyCollection<string> codes,
        CancellationToken cancellationToken = default)
    {
        var wanted = codes.Select(Normalize).Distinct().ToList();
        if (wanted.Count == 0)
        {
            return [];
        }

        return await dbContext.StorageLocations
            .AsNoTracking()
            .Where(l => l.WarehouseId == warehouseId && wanted.Contains(l.Code))
            .Select(l => l.Code)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<EndpointStorageLocation>> CreateAsync(
        Guid warehouseId,
        IReadOnlyList<PlannedStorageLocation> planned,
        CancellationToken cancellationToken = default)
    {
        if (planned.Count == 0)
        {
            return [];
        }

        var taken = await GetTakenCodesAsync(warehouseId, planned.Select(p => p.Code).ToList(), cancellationToken);
        var repeated = planned.GroupBy(p => Normalize(p.Code)).Where(g => g.Count() > 1).Select(g => g.Key);
        var clashing = taken.Concat(repeated).Distinct().ToList();
        if (clashing.Count > 0)
        {
            throw new ConflictException(
                $"Storage location code(s) '{string.Join(", ", clashing)}' already used in this warehouse.",
                "storage_location_code_used");
        }

        var endpointIds = planned.Select(p => p.EndpointId).ToList();
        if (await dbContext.StorageLocations.AnyAsync(l => endpointIds.Contains(l.EndpointId), cancellationToken))
        {
            throw EndpointUsed();
        }

        var now = DateTimeOffset.UtcNow;
        var locations = planned.Select(p => new StorageLocation
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            EndpointId = p.EndpointId,
            Code = Normalize(p.Code),
            Name = Shorten(p.Name.Trim()),
            IsActive = true,
            CreatedAt = now
        }).ToList();

        dbContext.StorageLocations.AddRange(locations);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (UniqueViolation.ConstraintOf(exception) is not null)
        {
            // The only unique index besides the key is on endpoint_id: another create took one of these Endpoints.
            throw EndpointUsed();
        }

        foreach (var location in locations)
        {
            logger.LogInformation(
                "Storage location {Code} created for endpoint {EndpointId} in warehouse {WarehouseId} from the map",
                location.Code,
                location.EndpointId,
                warehouseId);
        }

        return locations
            .Select(l => new EndpointStorageLocation(l.Id, l.EndpointId, l.Code, l.Name, l.IsActive))
            .ToList();
    }

    private static string Normalize(string code) => code.Trim().ToUpperInvariant();

    private static string Shorten(string name) => name.Length <= MaxNameLength ? name : name[..MaxNameLength];

    private static ConflictException EndpointUsed() =>
        new("One of these endpoints already serves a storage location.", "endpoint_already_used");
}
