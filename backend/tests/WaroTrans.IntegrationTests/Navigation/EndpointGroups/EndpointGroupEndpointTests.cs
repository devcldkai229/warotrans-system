using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Navigation.EndpointGroups;

/// <summary>NV-01: endpoint group CRUD on DRAFT maps only, members from the same map version.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class EndpointGroupEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private async Task<Guid> DraftMapAsync()
    {
        var warehouseId = Guid.NewGuid();
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
            {
                Id = warehouseId,
                Code = "WH-EG-" + Guid.NewGuid().ToString("N")[..6],
                Name = "EG",
                Timezone = "Asia/Ho_Chi_Minh",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var map = await Client.PostAsJsonAsync($"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Map", mapUri = "http://storage/map.yaml", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        map.EnsureSuccessStatusCode();
        return (await map.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private async Task<Guid> EndpointAsync(Guid mapId, string name, double x)
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints",
            new { name, endpointType = "WAYPOINT", x, y = 2.0, yaw = 0.0, positionTolerance = 0.1, yawTolerance = 0.2 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task A_group_is_created_listed_changed_and_deleted_on_a_draft_map()
    {
        var mapId = await DraftMapAsync();
        var p1 = await EndpointAsync(mapId, "Park 1", 1);
        var p2 = await EndpointAsync(mapId, "Park 2", 2);

        var create = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoint-groups",
            new { code = "parking", name = "Parking", selectionPolicy = "NEAREST", endpointIds = new[] { p1, p2 } });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var group = await create.Content.ReadFromJsonAsync<JsonElement>();
        var id = group.GetProperty("id").GetGuid();
        Assert.Equal("PARKING", group.GetProperty("code").GetString());
        Assert.Equal(2, group.GetProperty("members").GetArrayLength());

        var duplicate = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoint-groups",
            new { code = "PARKING", name = "Again", endpointIds = new[] { p1 } });
        Assert.Equal("endpoint_group_code_taken", await duplicate.ReadErrorCodeAsync());

        // An endpoint in a group cannot be deleted out from under it.
        var deleteMember = await Client.DeleteAsync($"/api/navigation/endpoints/{p1}");
        Assert.Equal(HttpStatusCode.Conflict, deleteMember.StatusCode);

        var update = await Client.PutAsJsonAsync($"/api/navigation/endpoint-groups/{id}", new { name = "Parking bay", endpointIds = new[] { p2 } });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Parking bay", updated.GetProperty("name").GetString());
        Assert.Equal(p2, updated.GetProperty("members")[0].GetProperty("endpointId").GetGuid());

        var list = await Client.GetFromJsonAsync<JsonElement>($"/api/navigation/maps/{mapId}/endpoint-groups");
        Assert.Equal(1, list.GetArrayLength());

        Assert.Equal(HttpStatusCode.NoContent, (await Client.DeleteAsync($"/api/navigation/endpoint-groups/{id}")).StatusCode);
        Assert.Equal(0, (await Client.GetFromJsonAsync<JsonElement>($"/api/navigation/maps/{mapId}/endpoint-groups")).GetArrayLength());
    }

    [Fact]
    public async Task Members_must_belong_to_the_same_map_and_a_published_map_is_frozen()
    {
        var mapId = await DraftMapAsync();
        var otherMap = await DraftMapAsync();
        var mine = await EndpointAsync(mapId, "Mine", 1);
        var foreign = await EndpointAsync(otherMap, "Foreign", 1);

        var mixed = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoint-groups",
            new { code = "G", name = "G", endpointIds = new[] { mine, foreign } });
        Assert.Equal("endpoint_not_in_map", await mixed.ReadErrorCodeAsync());

        var empty = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoint-groups",
            new { code = "G", name = "G", endpointIds = Array.Empty<Guid>() });
        Assert.Equal("endpoint_group_empty", await empty.ReadErrorCodeAsync());

        var created = await (await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoint-groups",
            new { code = "G", name = "G", endpointIds = new[] { mine } })).Content.ReadFromJsonAsync<JsonElement>();
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        var frozen = await Client.PutAsJsonAsync($"/api/navigation/endpoint-groups/{created.GetProperty("id").GetGuid()}", new { name = "X" });
        Assert.Equal("map_version_not_draft", await frozen.ReadErrorCodeAsync());
        Assert.Equal(1, (await Client.GetFromJsonAsync<JsonElement>($"/api/navigation/maps/{mapId}/endpoint-groups")).GetArrayLength());
    }
}
