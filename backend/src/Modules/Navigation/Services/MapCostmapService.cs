using System.Collections.Concurrent;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Maps;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Services;

/// <summary>A map version's own Nav2 costmap (rows bottom-up, OccupancyGrid values 0..100, 255 unknown).</summary>
public sealed record MapCostmap(
    Guid MapVersionId,
    int Width,
    int Height,
    double Resolution,
    double OriginX,
    double OriginY,
    double InscribedRadius,
    double InflationRadius,
    byte[] Grid)
{
    public byte? CostAt(double x, double y) =>
        StaticCostmap.CostAt(Grid, Width, Height, Resolution, OriginX, OriginY, x, y);
}

/// <summary>
/// The costmap a robot plans on for a map version right after mapping (its occupancy PGM + Nav2 inflation), for the
/// map editor overlay and for refusing an endpoint where a robot's centre may not be (cyan / magenta).
/// </summary>
public sealed class MapCostmapService(IMapAssetStore assets)
{
    private static readonly ConcurrentDictionary<(Guid, string), MapCostmap> Cache = new();

    public async Task<MapCostmap?> GetAsync(MapVersion map, CancellationToken cancellationToken)
    {
        if (PendingMapAssetUris.IsPending(map.MapUri) || map.Resolution <= 0)
        {
            return null;
        }

        if (Cache.TryGetValue((map.Id, map.MapUri), out var hit))
        {
            return hit;
        }

        var bytes = await assets.TryReadMapPgmAsync(map.MapUri, map.WarehouseId, map.Id, cancellationToken);
        if (bytes is null || StaticCostmap.ReadPgm(bytes) is not { } pgm)
        {
            return null;
        }

        var (occupied, unknown) = StaticCostmap.Classify(pgm.Pixels);
        var grid = StaticCostmap.Compute(occupied, pgm.Width, pgm.Height, map.Resolution, StaticCostmap.DefaultInscribed,
            StaticCostmap.DefaultInflationRadius, StaticCostmap.DefaultCostScaling);
        for (var y = 0; y < pgm.Height; y++)
        {
            for (var x = 0; x < pgm.Width; x++)
            {
                var g = (pgm.Height - 1 - y) * pgm.Width + x;
                if (unknown[y * pgm.Width + x] && grid[g] == 0)
                {
                    grid[g] = 255;
                }
            }
        }

        var costmap = new MapCostmap(map.Id, pgm.Width, pgm.Height, map.Resolution, map.OriginX, map.OriginY,
            StaticCostmap.DefaultInscribed, StaticCostmap.DefaultInflationRadius, grid);
        Cache[(map.Id, map.MapUri)] = costmap;
        return costmap;
    }

    /// <summary>
    /// An endpoint is where a robot's centre stops: refused on a wall (100) or within the inscribed radius of one
    /// (99), where Nav2 cannot plan to it. Lanes and zones are not checked. A map without an occupancy image skips it.
    /// </summary>
    public async Task EnsureEndpointPlaceableAsync(MapVersion map, double x, double y, CancellationToken cancellationToken)
    {
        if (await GetAsync(map, cancellationToken) is not { } costmap || costmap.CostAt(x, y) is not { } cost)
        {
            return;
        }

        if (cost is >= StaticCostmap.BlockedFrom and <= 100)
        {
            var what = cost == 100 ? "on a wall" : $"closer than {costmap.InscribedRadius:0.###} m to a wall";
            throw new DomainValidationException(
                $"An endpoint cannot be placed at ({x:0.###}, {y:0.###}): it is {what}, where a robot's centre may not be " +
                "(costmap cyan / magenta). Move it into the free area.",
                "endpoint_in_costmap_blocked");
        }
    }
}
