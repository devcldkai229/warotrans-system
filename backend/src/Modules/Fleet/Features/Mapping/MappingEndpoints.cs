using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Fleet.Features.Mapping;

public sealed record StartMappingRequest(Guid RobotId);

public sealed record FinishMappingRequest(string? Name = null);

/// <summary>Map building from the web: Configure → Facility → Build map.</summary>
public static class MappingEndpoints
{
    public static RouteGroupBuilder MapMapping(this RouteGroupBuilder group)
    {
        group.MapGet("/mapping/robots", async (Guid warehouseId, MappingService mapping, CancellationToken ct) =>
                Results.Ok(await mapping.ListRobotsAsync(warehouseId, ct)))
            .RequirePermission(Permissions.MapWrite)
            .WithName("ListMappingRobots")
            .WithDescription("Robots of a warehouse and whether each can build a map now (online, enabled, idle, not held, not driven by someone else).");

        group.MapGet("/mapping/sessions", async (Guid warehouseId, bool? open, MappingService mapping, CancellationToken ct) =>
                Results.Ok(await mapping.ListAsync(warehouseId, open ?? true, ct)))
            .RequirePermission(Permissions.MapRead)
            .WithName("ListMappingSessions");

        group.MapPost("/mapping/sessions", async (StartMappingRequest request, MappingService mapping, CancellationToken ct) =>
            {
                var session = await mapping.StartAsync(request.RobotId, ct);
                return Results.Accepted($"/api/fleet/mapping/sessions/{session.Id}", session);
            })
            .RequirePermission(Permissions.MapWrite)
            .Audited("map.mapping_started", "MAPPING_SESSION", null)
            .WithName("StartMappingSession")
            .WithDescription("The robot pauses localization and starts slam_toolbox (START_MAPPING). Follow GET sessions/{id}: STARTING → MAPPING. Drive it with the manual-drive lease and teleop meanwhile.");

        group.MapGet("/mapping/sessions/{id:guid}", async (Guid id, MappingService mapping, CancellationToken ct) =>
                Results.Ok(await mapping.GetAsync(id, ct)))
            .RequirePermission(Permissions.MapRead)
            .WithName("GetMappingSession");

        group.MapGet("/mapping/sessions/{id:guid}/preview", async (Guid id, MappingService mapping, CancellationToken ct) =>
                Results.Ok(await mapping.PreviewAsync(id, ct)))
            .RequirePermission(Permissions.MapRead)
            .WithName("GetMappingPreview")
            .WithDescription("The newest live view: robot pose in the new map and the map so far (downsampled occupancy, zlib + base64, bottom row first, 0..100, 255 unknown).");

        group.MapPost("/mapping/sessions/{id:guid}/finish", async (Guid id, FinishMappingRequest? request, MappingService mapping, CancellationToken ct) =>
                Results.Accepted($"/api/fleet/mapping/sessions/{id}", await mapping.FinishAsync(id, request?.Name, ct)))
            .RequirePermission(Permissions.MapWrite)
            .Audited("map.mapping_finished", "MAPPING_SESSION", "id")
            .WithName("FinishMappingSession")
            .WithDescription("Saves the map (STOP_MAPPING save): SAVING → COMPLETED with resultMapVersionId, a DRAFT map version to edit. On a robot-side failure the session goes back to MAPPING with errorCode.");

        group.MapPost("/mapping/sessions/{id:guid}/cancel", async (Guid id, MappingService mapping, CancellationToken ct) =>
                Results.Accepted($"/api/fleet/mapping/sessions/{id}", await mapping.CancelAsync(id, ct)))
            .RequirePermission(Permissions.MapWrite)
            .Audited("map.mapping_cancelled", "MAPPING_SESSION", "id")
            .WithName("CancelMappingSession");

        return group;
    }
}
