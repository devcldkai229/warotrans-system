using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;

namespace WaroTrans.Navigation.Features.GetMapCostmap;

/// <summary>A map version's own costmap (occupancy + Nav2 inflation) for the map editor overlay.</summary>
public static class GetMapCostmapEndpoint
{
    public static void Map(RouteGroupBuilder group) =>
        group.MapGet("/maps/{id:guid}/costmap", async (Guid id, NavigationDbContext db, MapCostmapService costmaps,
                CancellationToken ct) =>
            {
                var map = await db.MapVersions.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id, ct);
                if (map is null)
                {
                    return Results.NotFound();
                }

                var c = await costmaps.GetAsync(map, ct);
                return c is null
                    ? Results.NoContent()
                    : Results.Ok(new
                    {
                        robotCode = "MAP",
                        kind = "global",
                        source = "map occupancy + Nav2 inflation",
                        resolution = c.Resolution,
                        originX = c.OriginX,
                        originY = c.OriginY,
                        width = c.Width,
                        height = c.Height,
                        rowOrder = "bottom-up",
                        data = Convert.ToBase64String(c.Grid),
                        inscribedRadius = c.InscribedRadius,
                        inflationRadius = c.InflationRadius,
                    });
            })
            .RequirePermission(Permissions.MapRead)
            .WithName("GetMapVersionCostmap")
            .WithSummary("The map version's own costmap (occupancy + Nav2 inflation); 204 without an occupancy image")
            .WithTags("Navigation");
}
