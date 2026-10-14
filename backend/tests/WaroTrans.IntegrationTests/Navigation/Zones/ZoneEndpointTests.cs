using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Navigation.Zones;

[Collection(IntegrationCollection.Name)]
public sealed class ZoneEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private sealed record MapDto(Guid Id);

    private sealed record ZoneDto(
        Guid Id,
        Guid MapVersionId,
        string Code,
        string Name,
        string ZoneType,
        JsonElement Geometry,
        int Capacity,
        double? MaxSpeed,
        bool IsActive,
        JsonElement? Policy,
        int PolicySchemaVersion);

    private static object ClosedSquare(double size = 4) => new
    {
        type = "Polygon",
        coordinates = new[]
        {
            new[]
            {
                new[] { 0.0, 0.0 },
                new[] { size, 0.0 },
                new[] { size, size },
                new[] { 0.0, size },
                new[] { 0.0, 0.0 }
            }
        }
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

    private static async Task<string?> ProblemCodeAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    [Fact]
    public async Task Post_zone_persists_geojson_polygon_on_draft()
    {
        var mapId = await CreateDraftMapAsync();

        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/zones", new
        {
            name = "Restricted bay",
            zoneType = "RESTRICTED_AREA",
            geometry = ClosedSquare(),
            capacity = 2,
            isActive = true
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<ZoneDto>())!;
        Assert.Equal("RESTRICTED_AREA", created.ZoneType);
        Assert.Equal("Polygon", created.Geometry.GetProperty("type").GetString());
        Assert.Equal(2, created.Capacity);

        var list = (await Client.GetFromJsonAsync<List<ZoneDto>>($"/api/navigation/maps/{mapId}/zones"))!;
        Assert.Contains(list, z => z.Id == created.Id);
    }

    [Fact]
    public async Task Put_zone_updates_intersection_policy()
    {
        var mapId = await CreateDraftMapAsync();
        var create = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/zones", new
        {
            name = "Junction",
            zoneType = "INTERSECTION",
            geometry = ClosedSquare(3),
            capacity = 2,
            isActive = true
        });
        create.EnsureSuccessStatusCode();
        var zone = (await create.Content.ReadFromJsonAsync<ZoneDto>())!;

        var response = await Client.PutAsJsonAsync($"/api/navigation/zones/{zone.Id}", new
        {
            name = "Junction A",
            zoneType = "INTERSECTION",
            geometry = ClosedSquare(3),
            capacity = 2,
            isActive = true,
            policy = new { preferredDirectionYaw = 1.57, headingToleranceRadians = 0.2 },
            policySchemaVersion = 1
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<ZoneDto>())!;
        Assert.Equal("Junction A", updated.Name);
        Assert.NotNull(updated.Policy);
        Assert.Equal(1.57, updated.Policy!.Value.GetProperty("preferredDirectionYaw").GetDouble());
    }

    [Fact]
    public async Task Post_narrow_area_requires_capacity_one_and_max_speed()
    {
        var mapId = await CreateDraftMapAsync();

        var bad = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/zones", new
        {
            name = "Narrow",
            zoneType = "NARROW_AREA",
            geometry = ClosedSquare(2),
            capacity = 2,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        var ok = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/zones", new
        {
            name = "Narrow",
            zoneType = "NARROW_AREA",
            geometry = ClosedSquare(2),
            capacity = 1,
            maxSpeed = 0.4,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
    }

    [Fact]
    public async Task Delete_zone_and_reject_when_published()
    {
        var mapId = await CreateDraftMapAsync();
        var create = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/zones", new
        {
            name = "Temp",
            zoneType = "RESTRICTED_AREA",
            geometry = ClosedSquare(),
            capacity = 1,
            isActive = true
        });
        create.EnsureSuccessStatusCode();
        var zone = (await create.Content.ReadFromJsonAsync<ZoneDto>())!;

        var deleted = await Client.DeleteAsync($"/api/navigation/zones/{zone.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var recreate = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/zones", new
        {
            name = "Keep",
            zoneType = "RESTRICTED_AREA",
            geometry = ClosedSquare(),
            capacity = 1,
            isActive = true
        });
        recreate.EnsureSuccessStatusCode();
        var kept = (await recreate.Content.ReadFromJsonAsync<ZoneDto>())!;
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        var blocked = await Client.DeleteAsync($"/api/navigation/zones/{kept.Id}");
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
        Assert.Equal("map_version_not_draft", await ProblemCodeAsync(blocked));
    }
}
