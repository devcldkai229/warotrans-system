using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Navigation.Maps;

/// <summary>GET /maps/{id}/route-graph: the Nav2 Route Server graph generated from the map's Edges and Endpoints.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class RouteGraphTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private sealed record MapDto(Guid Id, string Code);

    private async Task<MapDto> CreateDraftAsync()
    {
        var warehouseId = Guid.NewGuid();
        var suffix = warehouseId.ToString("N")[..8].ToUpperInvariant();
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
            {
                Id = warehouseId, Code = $"WH-{suffix}", Name = $"Warehouse {suffix}", Timezone = "Asia/Ho_Chi_Minh",
                IsActive = true, CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var response = await Client.PostAsJsonAsync($"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Floor", mapUri = "/map-assets/map.pgm", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MapDto>())!;
    }

    private async Task AddLaneAsync(Guid mapId, string direction, params double[][] points) =>
        (await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/edges", new
        {
            geometry = new { type = "LineString", coordinates = points },
            widthMeters = 0.5,
            direction,
            capacity = 1,
            maxSpeed = 0.3
        })).EnsureSuccessStatusCode();

    private async Task AddStopAsync(Guid mapId, string name, double x, double y) =>
        (await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints",
            new { name, endpointType = "WAYPOINT", x, y, yaw = 0.0, positionTolerance = 0.15, yawTolerance = 0.25 }))
        .EnsureSuccessStatusCode();

    private static (int Nodes, int Edges, int Connectors) Count(JsonElement collection)
    {
        var features = collection.GetProperty("features").EnumerateArray().ToList();
        var lines = features.Where(f => f.GetProperty("geometry").GetProperty("type").GetString() == "MultiLineString").ToList();
        return (
            features.Count(f => f.GetProperty("geometry").GetProperty("type").GetString() == "Point"),
            lines.Count,
            lines.Count(l => l.GetProperty("properties").GetProperty("metadata").TryGetProperty("connector", out _)));
    }

    [Fact]
    public async Task Route_graph_of_a_valid_map_is_geojson_with_nodes_lanes_and_connectors()
    {
        var map = await CreateDraftAsync();
        await AddLaneAsync(map.Id, "BIDIRECTIONAL", [0.0, 0.0], [2.0, 0.0]);
        await AddStopAsync(map.Id, "Dock A", 0.0, 0.0);              // on the lane end
        await AddStopAsync(map.Id, "Dock B", 2.0, 0.2);              // 0.2 m beside the lane end → connectors

        var response = await Client.GetAsync($"/api/navigation/maps/{map.Id}/route-graph");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/geo+json", response.Content.Headers.ContentType?.MediaType);
        Assert.False(response.Headers.Contains("X-Route-Graph-Warnings"));
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("FeatureCollection", json.RootElement.GetProperty("type").GetString());
        Assert.Equal(map.Code, json.RootElement.GetProperty("name").GetString());
        Assert.Equal((3, 4, 2), Count(json.RootElement));            // (0,0) (2,0) (2,0.2); 2 lane + 2 connector edges
        var codes = json.RootElement.GetProperty("features").EnumerateArray()
            .Where(f => f.GetProperty("properties").GetProperty("metadata").TryGetProperty("endpoint_codes", out _))
            .SelectMany(f => f.GetProperty("properties").GetProperty("metadata").GetProperty("endpoint_codes").EnumerateArray())
            .Select(c => c.GetString())
            .Order()
            .ToList();
        Assert.Equal(["EP-DOCK-A", "EP-DOCK-B"], codes);
    }

    [Fact]
    public async Task A_dead_end_lane_is_reported_as_a_warning_header()
    {
        var map = await CreateDraftAsync();
        await AddLaneAsync(map.Id, "BIDIRECTIONAL", [0.0, 0.0], [2.0, 0.0]);
        await AddLaneAsync(map.Id, "ONE_WAY", [2.0, 0.0], [2.0, -1.0]);   // leads nowhere
        await AddStopAsync(map.Id, "Dock A", 0.0, 0.0);

        var response = await Client.GetAsync($"/api/navigation/maps/{map.Id}/route-graph");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("1", Assert.Single(response.Headers.GetValues("X-Route-Graph-Warnings")));
    }

    [Fact]
    public async Task An_endpoint_too_far_from_every_lane_is_422_with_the_issue()
    {
        var map = await CreateDraftAsync();
        await AddLaneAsync(map.Id, "BIDIRECTIONAL", [0.0, 0.0], [2.0, 0.0]);
        await AddStopAsync(map.Id, "Far Dock", 1.0, 0.8);

        var response = await Client.GetAsync($"/api/navigation/maps/{map.Id}/route-graph");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("route_graph_invalid", json.RootElement.GetProperty("code").GetString());
        var issue = Assert.Single(json.RootElement.GetProperty("issues").EnumerateArray());
        Assert.Equal("ENDPOINT_TOO_FAR", issue.GetProperty("code").GetString());
        Assert.Equal("ERROR", issue.GetProperty("severity").GetString());
        Assert.Equal("EP-FAR-DOCK", issue.GetProperty("relatedCodes")[0].GetString());
        Assert.Contains("0.80 m", issue.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Unknown_map_is_404()
    {
        var response = await Client.GetAsync($"/api/navigation/maps/{Guid.NewGuid()}/route-graph");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("map_version_not_found", json.RootElement.GetProperty("code").GetString());
    }
}
