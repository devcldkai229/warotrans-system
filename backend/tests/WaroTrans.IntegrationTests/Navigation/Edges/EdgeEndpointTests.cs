using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Navigation.Edges;

/// <summary>
/// HTTP → EF → PostgreSQL coverage for Edge (Lane) configuration on a MapVersion.
/// Geometry contract is GeoJSON LineString; WidthMeters is required.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed partial class EdgeEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private sealed record MapDto(Guid Id, string Status);

    private sealed record EdgeDto(
        Guid Id,
        Guid MapVersionId,
        string Code,
        JsonElement Geometry,
        double WidthMeters,
        string Direction,
        int Capacity,
        double? MaxSpeed,
        bool IsActive);

    [GeneratedRegex(@"^EDGE-(\d{3,})$")]
    private static partial Regex EdgeCodeRegex();

    private static int SequenceOf(string code)
    {
        var match = EdgeCodeRegex().Match(code);
        Assert.True(match.Success, $"'{code}' does not match EDGE-NNN.");
        return int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
    }

    private static object EdgeBody(string direction = "ONE_WAY", int capacity = 2, double? maxSpeed = 0.8, bool? isActive = null) => new
    {
        geometry = new { type = "LineString", coordinates = new[] { new[] { 1.0, 2.0 }, new[] { 2.5, 2.2 }, new[] { 4.0, 3.0 } } },
        widthMeters = 1.2,
        direction,
        capacity,
        maxSpeed,
        isActive
    };

    private async Task<Guid> SeedWarehouseAsync()
    {
        var warehouseId = Guid.NewGuid();
        var suffix = warehouseId.ToString("N")[..8].ToUpperInvariant();
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
        {
            Id = warehouseId,
            Code = $"WH-{suffix}",
            Name = $"Warehouse {suffix}",
            Timezone = "Asia/Ho_Chi_Minh",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
        return warehouseId;
    }

    private async Task<Guid> CreateDraftMapAsync()
    {
        var warehouseId = await SeedWarehouseAsync();
        var response = await Client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Map", mapUri = "/map-assets/map.pgm", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MapDto>())!.Id;
    }

    private async Task<EdgeDto> CreateEdgeAsync(Guid mapId, string direction = "ONE_WAY")
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/edges", EdgeBody(direction));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<EdgeDto>())!;
    }

    private async Task PublishAsync(Guid mapId) =>
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

    private static async Task<string?> ProblemCodeAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    [Fact]
    public async Task Post_edge_persists_row_with_generated_code_and_geojson_geometry()
    {
        var mapId = await CreateDraftMapAsync();

        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/edges", EdgeBody());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<EdgeDto>())!;
        Assert.Equal($"/api/navigation/edges/{created.Id}", response.Headers.Location?.ToString());
        Assert.Matches(EdgeCodeRegex(), created.Code);
        Assert.Equal("ONE_WAY", created.Direction);
        Assert.Equal(1.2, created.WidthMeters);
        Assert.Equal(2, created.Capacity);
        Assert.Equal(0.8, created.MaxSpeed);
        Assert.True(created.IsActive);
        Assert.Equal("LineString", created.Geometry.GetProperty("type").GetString());
        Assert.Equal(2.5, created.Geometry.GetProperty("coordinates")[1][0].GetDouble());

        await using var connection = new NpgsqlConnection(PostgreSql.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            SELECT map_version_id, code, direction, capacity, max_speed, is_active, width_meters,
                   geometry->>'type', (geometry->'coordinates'->1->>0)::float8
            FROM navigation.edges WHERE id = @id
            """,
            connection);
        command.Parameters.AddWithValue("id", created.Id);
        await using var reader = await command.ExecuteReaderAsync();

        Assert.True(await reader.ReadAsync());
        Assert.Equal(mapId, reader.GetGuid(0));
        Assert.Equal(created.Code, reader.GetString(1));
        Assert.Equal("ONE_WAY", reader.GetString(2));
        Assert.Equal(2, reader.GetInt32(3));
        Assert.Equal(0.8, reader.GetDouble(4));
        Assert.True(reader.GetBoolean(5));
        Assert.Equal(1.2, reader.GetDouble(6));
        Assert.Equal("LineString", reader.GetString(7));
        Assert.Equal(2.5, reader.GetDouble(8));
    }

    [Fact]
    public async Task Post_edges_get_consecutive_global_codes_across_maps()
    {
        var mapId = await CreateDraftMapAsync();
        var otherMapId = await CreateDraftMapAsync();

        var first = await CreateEdgeAsync(mapId);
        var second = await CreateEdgeAsync(otherMapId, "bidirectional");
        var third = await CreateEdgeAsync(mapId);

        Assert.Equal(SequenceOf(first.Code) + 1, SequenceOf(second.Code));
        Assert.Equal(SequenceOf(second.Code) + 1, SequenceOf(third.Code));
        Assert.Equal("BIDIRECTIONAL", second.Direction);
    }

    [Fact]
    public async Task Concurrent_posts_all_succeed_with_distinct_codes()
    {
        var mapId = await CreateDraftMapAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/edges", EdgeBody())));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));

        var list = (await Client.GetFromJsonAsync<List<EdgeDto>>($"/api/navigation/maps/{mapId}/edges"))!;
        Assert.Equal(8, list.Count);
        Assert.Equal(8, list.Select(e => e.Code).Distinct().Count());
    }

    [Fact]
    public async Task Post_edge_returns_404_when_map_missing()
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{Guid.NewGuid()}/edges", EdgeBody());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("map_version_not_found", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Post_edge_returns_400_when_map_published()
    {
        var mapId = await CreateDraftMapAsync();
        await PublishAsync(mapId);

        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/edges", EdgeBody());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("map_version_not_draft", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Post_edge_returns_400_when_request_invalid()
    {
        var mapId = await CreateDraftMapAsync();

        var onePoint = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/edges", new
        {
            geometry = new { type = "LineString", coordinates = new[] { new[] { 1.0, 1.0 } } },
            widthMeters = 1.0,
            direction = "ONE_WAY",
            capacity = 1
        });
        var badDirection = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/edges", EdgeBody(direction: "TWO_WAY"));
        var noGeometry = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/edges", new { direction = "ONE_WAY", capacity = 1, widthMeters = 1.0 });

        foreach (var response in new[] { onePoint, badDirection, noGeometry })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("validation_failed", await ProblemCodeAsync(response));
        }
    }

    [Fact]
    public async Task Get_edges_returns_only_edges_of_map_ordered_by_code()
    {
        var mapId = await CreateDraftMapAsync();
        var otherMapId = await CreateDraftMapAsync();
        var first = await CreateEdgeAsync(mapId);
        var second = await CreateEdgeAsync(mapId);
        await CreateEdgeAsync(otherMapId);

        var list = (await Client.GetFromJsonAsync<List<EdgeDto>>($"/api/navigation/maps/{mapId}/edges"))!;

        Assert.Equal([first.Code, second.Code], list.Select(e => e.Code));
        Assert.Equal(first.Id, list[0].Id);
        Assert.Equal("LineString", list[0].Geometry.GetProperty("type").GetString());
    }

    [Fact]
    public async Task Get_edges_returns_404_when_map_missing()
    {
        var response = await Client.GetAsync($"/api/navigation/maps/{Guid.NewGuid()}/edges");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("map_version_not_found", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Get_edge_by_id_returns_edge_or_404()
    {
        var mapId = await CreateDraftMapAsync();
        var created = await CreateEdgeAsync(mapId);

        var found = (await Client.GetFromJsonAsync<EdgeDto>($"/api/navigation/edges/{created.Id}"))!;
        var missing = await Client.GetAsync($"/api/navigation/edges/{Guid.NewGuid()}");

        Assert.Equal(created.Code, found.Code);
        Assert.Equal(created.WidthMeters, found.WidthMeters);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("edge_not_found", await ProblemCodeAsync(missing));
    }

    [Fact]
    public async Task Put_edge_updates_fields_and_keeps_code()
    {
        var mapId = await CreateDraftMapAsync();
        var edge = await CreateEdgeAsync(mapId);

        var response = await Client.PutAsJsonAsync($"/api/navigation/edges/{edge.Id}", new
        {
            geometry = new { type = "LineString", coordinates = new[] { new[] { 10.0, 10.0 }, new[] { 20.0, 10.0 } } },
            widthMeters = 2.5,
            direction = "BIDIRECTIONAL",
            capacity = 3,
            maxSpeed = (double?)null,
            isActive = false
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<EdgeDto>())!;
        Assert.Equal(edge.Code, updated.Code);
        Assert.Equal("BIDIRECTIONAL", updated.Direction);
        Assert.Equal(2.5, updated.WidthMeters);
        Assert.Equal(3, updated.Capacity);
        Assert.Null(updated.MaxSpeed);
        Assert.False(updated.IsActive);

        var reloaded = (await Client.GetFromJsonAsync<EdgeDto>($"/api/navigation/edges/{edge.Id}"))!;
        Assert.Equal(20.0, reloaded.Geometry.GetProperty("coordinates")[1][0].GetDouble());
        Assert.Equal(3, reloaded.Capacity);
        Assert.False(reloaded.IsActive);
    }

    [Fact]
    public async Task Put_edge_returns_400_when_map_published()
    {
        var mapId = await CreateDraftMapAsync();
        var edge = await CreateEdgeAsync(mapId);
        await PublishAsync(mapId);

        var response = await Client.PutAsJsonAsync($"/api/navigation/edges/{edge.Id}", new
        {
            geometry = new { type = "LineString", coordinates = new[] { new[] { 0.0, 0.0 }, new[] { 1.0, 0.0 } } },
            widthMeters = 1.0,
            direction = "ONE_WAY",
            capacity = 1,
            isActive = true
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("map_version_not_draft", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Delete_edge_removes_it_from_the_map()
    {
        var mapId = await CreateDraftMapAsync();
        var edge = await CreateEdgeAsync(mapId);
        var other = await CreateEdgeAsync(mapId);

        var response = await Client.DeleteAsync($"/api/navigation/edges/{edge.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var afterDelete = await Client.GetAsync($"/api/navigation/edges/{edge.Id}");
        Assert.Equal(HttpStatusCode.NotFound, afterDelete.StatusCode);
        var list = (await Client.GetFromJsonAsync<List<EdgeDto>>($"/api/navigation/maps/{mapId}/edges"))!;
        Assert.Equal(other.Id, Assert.Single(list).Id);
    }

    [Fact]
    public async Task Delete_edge_returns_404_when_missing()
    {
        var response = await Client.DeleteAsync($"/api/navigation/edges/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("edge_not_found", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Delete_edge_returns_400_and_keeps_edge_when_map_published()
    {
        var mapId = await CreateDraftMapAsync();
        var edge = await CreateEdgeAsync(mapId);
        await PublishAsync(mapId);

        var response = await Client.DeleteAsync($"/api/navigation/edges/{edge.Id}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("map_version_not_draft", await ProblemCodeAsync(response));
        var stillThere = await Client.GetAsync($"/api/navigation/edges/{edge.Id}");
        Assert.Equal(HttpStatusCode.OK, stillThere.StatusCode);
    }
}
