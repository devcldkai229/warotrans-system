using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.GetPlace;

/// <summary>
/// An Endpoint or EndpointGroup id as a place: its code and the map version it belongs to. A workflow keeps the id it
/// was configured with; the editor shows it by code ("EP-INBOUND, from MAP-ONE-V019") and the runtime uses the place
/// with that code on the Job's map.
/// </summary>
public sealed record PlaceResponse(Guid Id, bool IsGroup, string Code, string Name, Guid MapVersionId, string MapVersionCode, string MapStatus);

public static class GetPlaceEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/places/{id:guid}", async (Guid id, NavigationDbContext db, CancellationToken ct) =>
            {
                var endpoint = await db.Endpoints.AsNoTracking()
                    .Where(e => e.Id == id)
                    .Join(db.MapVersions, e => e.MapVersionId, m => m.Id,
                        (e, m) => new PlaceResponse(e.Id, false, e.Code, e.Name, m.Id, m.Code, m.Status.ToString()))
                    .FirstOrDefaultAsync(ct);
                if (endpoint is not null) return Results.Ok(endpoint);
                var group = await db.EndpointGroups.AsNoTracking()
                    .Where(g => g.Id == id)
                    .Join(db.MapVersions, g => g.MapVersionId, m => m.Id,
                        (g, m) => new PlaceResponse(g.Id, true, g.Code, g.Name, m.Id, m.Code, m.Status.ToString()))
                    .FirstOrDefaultAsync(ct);
                return group is not null
                    ? Results.Ok(group)
                    : throw new NotFoundException($"No endpoint or endpoint group '{id}'.", "place_not_found");
            })
            .RequirePermission(Permissions.MapRead)
            .WithName("GetPlace")
            .WithDescription("An Endpoint or EndpointGroup id: its code, name and map version (any status).");
    }
}
