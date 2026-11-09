using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Navigation.Features.EndpointGroups;

/// <summary>NV-01 CRUD. Reads need map.read; changes need map.write and a DRAFT map version.</summary>
public static class EndpointGroupEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/maps/{mapVersionId:guid}/endpoint-groups", async (
                Guid mapVersionId, EndpointGroupService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.ListAsync(mapVersionId, cancellationToken)))
            .RequirePermission(Permissions.MapRead)
            .WithName("ListEndpointGroups")
            .WithSummary("Endpoint groups of a map version with their members");

        endpoints.MapGet("/endpoint-groups/{id:guid}", async (
                Guid id, EndpointGroupService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.GetAsync(id, cancellationToken)))
            .RequirePermission(Permissions.MapRead)
            .WithName("GetEndpointGroup");

        endpoints.MapPost("/maps/{mapVersionId:guid}/endpoint-groups", async (
                Guid mapVersionId, CreateEndpointGroupRequest request, EndpointGroupService service, CancellationToken cancellationToken) =>
            {
                var created = await service.CreateAsync(mapVersionId, request, cancellationToken);
                return Results.Created($"/api/navigation/endpoint-groups/{created.Id}", created);
            })
            .RequirePermission(Permissions.MapWrite)
            .Audited("map.endpoint_group_created", "ENDPOINT_GROUP", null)
            .WithName("CreateEndpointGroup")
            .WithSummary("Create an endpoint group on a DRAFT map version");

        endpoints.MapPut("/endpoint-groups/{id:guid}", async (
                Guid id, UpdateEndpointGroupRequest request, EndpointGroupService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.UpdateAsync(id, request, cancellationToken)))
            .RequirePermission(Permissions.MapWrite)
            .Audited("map.endpoint_group_updated", "ENDPOINT_GROUP", "id")
            .WithName("UpdateEndpointGroup")
            .WithSummary("Rename, change policy, (de)activate or replace the members of a group (DRAFT map only)");

        endpoints.MapDelete("/endpoint-groups/{id:guid}", async (
                Guid id, EndpointGroupService service, CancellationToken cancellationToken) =>
            {
                await service.DeleteAsync(id, cancellationToken);
                return Results.NoContent();
            })
            .RequirePermission(Permissions.MapWrite)
            .Audited("map.endpoint_group_deleted", "ENDPOINT_GROUP", "id")
            .WithName("DeleteEndpointGroup")
            .WithSummary("Delete an endpoint group (DRAFT map only)");
    }
}
