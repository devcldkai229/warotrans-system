using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Navigation.Services;

/// <summary>
/// The storage location side of an Endpoint in the map editor. A location points at one Endpoint of the published
/// map; a cloned map's Endpoint takes it over on publish (it descends from that Endpoint), and an Endpoint marked in a
/// DRAFT gets a new location on publish.
/// </summary>
public sealed class EndpointStorage(NavigationDbContext dbContext, IEndpointStorageLocations storageLocations)
{
    public const string Linked = "LINKED";
    public const string Inherited = "INHERITED";
    public const string Pending = "PENDING";

    /// <summary>Longest clone-of-a-clone chain followed back to a storage location.</summary>
    private const int MaxCloneDepth = 32;

    public static string? Normalize(string? code) =>
        string.IsNullOrWhiteSpace(code) ? null : code.Trim().ToUpperInvariant();

    /// <summary>The storage location each Endpoint serves, takes over on publish, or will get on publish.</summary>
    public async Task<Dictionary<Guid, EndpointStorageLocationDto>> DescribeAsync(
        Guid warehouseId,
        IReadOnlyCollection<Endpoint> endpoints,
        CancellationToken cancellationToken = default)
    {
        var chains = await AncestorChainsAsync(endpoints, cancellationToken);
        var allIds = chains.Values.SelectMany(c => c).Distinct().ToList();
        var byEndpoint = (await storageLocations.GetByEndpointsAsync(warehouseId, allIds, cancellationToken))
            .ToDictionary(l => l.EndpointId);

        var result = new Dictionary<Guid, EndpointStorageLocationDto>();
        foreach (var endpoint in endpoints)
        {
            var chain = chains[endpoint.Id];
            var found = chain.Select(id => byEndpoint.GetValueOrDefault(id)).FirstOrDefault(l => l is not null);
            if (found is not null)
            {
                result[endpoint.Id] = new EndpointStorageLocationDto(
                    found.Code,
                    found.Name,
                    found.EndpointId == endpoint.Id ? Linked : Inherited,
                    found.IsActive);
            }
            else if (endpoint.StorageLocationCode is { } code)
            {
                result[endpoint.Id] = new EndpointStorageLocationDto(code, endpoint.Name, Pending, true);
            }
        }

        return result;
    }

    /// <summary>
    /// Refuses a mark that publishing could not honour: only an enabled WAYPOINT can hold Containers, an Endpoint that
    /// already serves (or takes over) a location keeps that one, and the code must be free in the warehouse and on
    /// this map.
    /// </summary>
    public async Task EnsureCanMarkAsync(
        MapVersion mapVersion,
        Endpoint endpoint,
        string code,
        CancellationToken cancellationToken = default)
    {
        if (endpoint.EndpointType != EndpointType.WAYPOINT)
        {
            throw new DomainValidationException(
                "Only a WAYPOINT endpoint can be a storage location.",
                "storage_location_needs_waypoint");
        }

        if (!endpoint.IsEnabled)
        {
            throw new DomainValidationException(
                $"Endpoint '{endpoint.Code}' is disabled, so it cannot be a storage location.",
                "endpoint_disabled");
        }

        var existing = (await DescribeAsync(mapVersion.WarehouseId, [endpoint], cancellationToken))
            .GetValueOrDefault(endpoint.Id);
        if (existing is { State: Linked or Inherited })
        {
            throw new ConflictException(
                $"This endpoint already serves storage location '{existing.Code}'.",
                "endpoint_already_storage_location");
        }

        var onThisMap = await dbContext.Endpoints.AsNoTracking()
            .AnyAsync(
                e => e.MapVersionId == mapVersion.Id && e.Id != endpoint.Id && e.StorageLocationCode == code,
                cancellationToken);
        var inWarehouse = (await storageLocations.GetTakenCodesAsync(mapVersion.WarehouseId, [code], cancellationToken))
            .Count > 0;
        if (onThisMap || inWarehouse)
        {
            throw new ConflictException(
                $"Storage location code '{code}' is already used in this warehouse.",
                "storage_location_code_used");
        }
    }

    /// <summary>
    /// Called once the map is PUBLISHED and its cloned Endpoints have taken over their locations: creates a location
    /// for each marked Endpoint that still has none, then clears the marks.
    /// </summary>
    public async Task<int> CreateMarkedAsync(MapVersion mapVersion, CancellationToken cancellationToken = default)
    {
        var marked = await dbContext.Endpoints
            .Where(e => e.MapVersionId == mapVersion.Id && e.StorageLocationCode != null)
            .ToListAsync(cancellationToken);
        if (marked.Count == 0)
        {
            return 0;
        }

        var served = (await storageLocations.GetByEndpointsAsync(
                mapVersion.WarehouseId, marked.Select(e => e.Id).ToList(), cancellationToken))
            .Select(l => l.EndpointId)
            .ToHashSet();
        var planned = marked
            .Where(e => !served.Contains(e.Id))
            .Select(e => new PlannedStorageLocation(e.Id, e.StorageLocationCode!, e.Name))
            .ToList();

        await storageLocations.CreateAsync(mapVersion.WarehouseId, planned, cancellationToken);

        foreach (var endpoint in marked)
        {
            endpoint.StorageLocationCode = null;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return planned.Count;
    }

    /// <summary>The marked codes of a DRAFT that a storage location of the warehouse already uses.</summary>
    public async Task<IReadOnlyList<string>> TakenMarkedCodesAsync(
        MapVersion mapVersion,
        CancellationToken cancellationToken = default)
    {
        var marked = await dbContext.Endpoints.AsNoTracking()
            .Where(e => e.MapVersionId == mapVersion.Id && e.StorageLocationCode != null)
            .ToListAsync(cancellationToken);
        if (marked.Count == 0)
        {
            return [];
        }

        // A mark on an Endpoint that takes over a location (it was added on the source map meanwhile) is dropped on
        // publish, not refused.
        var described = await DescribeAsync(mapVersion.WarehouseId, marked, cancellationToken);
        var codes = marked
            .Where(e => described.GetValueOrDefault(e.Id) is not { State: Linked or Inherited })
            .Select(e => e.StorageLocationCode!)
            .ToList();
        return await storageLocations.GetTakenCodesAsync(mapVersion.WarehouseId, codes, cancellationToken);
    }

    /// <summary>Each Endpoint → itself, then its source, its source's source, … (clone lineage).</summary>
    private async Task<Dictionary<Guid, List<Guid>>> AncestorChainsAsync(
        IReadOnlyCollection<Endpoint> endpoints,
        CancellationToken cancellationToken)
    {
        var parentOf = endpoints.ToDictionary(e => e.Id, e => e.SourceEndpointId);
        var unknown = endpoints.Select(e => e.SourceEndpointId).OfType<Guid>().Where(id => !parentOf.ContainsKey(id)).ToHashSet();

        for (var depth = 0; depth < MaxCloneDepth && unknown.Count > 0; depth++)
        {
            var ids = unknown.ToList();
            var parents = await dbContext.Endpoints.AsNoTracking()
                .Where(e => ids.Contains(e.Id))
                .Select(e => new { e.Id, e.SourceEndpointId })
                .ToListAsync(cancellationToken);
            foreach (var id in ids)
            {
                parentOf[id] = parents.FirstOrDefault(p => p.Id == id)?.SourceEndpointId;
            }

            unknown = parents.Select(p => p.SourceEndpointId).OfType<Guid>().Where(id => !parentOf.ContainsKey(id)).ToHashSet();
        }

        var chains = new Dictionary<Guid, List<Guid>>();
        foreach (var endpoint in endpoints)
        {
            var chain = new List<Guid> { endpoint.Id };
            var next = endpoint.SourceEndpointId;
            while (next is { } id && chain.Count <= MaxCloneDepth && !chain.Contains(id))
            {
                chain.Add(id);
                next = parentOf.GetValueOrDefault(id);
            }

            chains[endpoint.Id] = chain;
        }

        return chains;
    }
}
