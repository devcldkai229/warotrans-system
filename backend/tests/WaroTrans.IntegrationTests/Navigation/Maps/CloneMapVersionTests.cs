using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Navigation.Maps;

/// <summary>
/// POST /maps/{id}/clone: a published (read-only) map becomes an editable DRAFT copy whose endpoints / zones / edges
/// get codes from the system code generator (endpoint EP-{NAME}, zone ZONE-{NAME}, edge EDGE-nnn) and new ids; publishing the copy moves storage locations onto the copied endpoints.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class CloneMapVersionTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private sealed record MapDto(Guid Id, Guid WarehouseId, string Code, int VersionNo, string Name, string Status, string MapUri,
        int ImageWidthPixels, string? ContentHash, Guid? SourceMapVersionId);

    private sealed record EndpointDto(Guid Id, string Code, string Name, string EndpointType, double X, double Y, double Yaw);

    private sealed record EdgeDto(Guid Id, string Code, JsonElement Geometry, string Direction);

    private sealed record ZoneDto(Guid Id, string Code, string Name, string ZoneType, JsonElement Geometry, int Capacity);

    private sealed record DetailDto(Guid Id, string Code, string Status, Guid? SourceMapVersionId, string? SourceMapVersionCode,
        List<EndpointDto> Endpoints, List<EdgeDto> Edges, List<ZoneDto> Zones);

    private static readonly object Square = new
    {
        type = "Polygon",
        coordinates = new[] { new[] { new[] { 0.0, 0.0 }, new[] { 1.0, 0.0 }, new[] { 1.0, 1.0 }, new[] { 0.0, 1.0 }, new[] { 0.0, 0.0 } } }
    };

    private async Task<Guid> SeedWarehouseAsync()
    {
        var warehouseId = Guid.NewGuid();
        var suffix = warehouseId.ToString("N")[..8].ToUpperInvariant();
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
        {
            Id = warehouseId, Code = $"WH-{suffix}", Name = $"Warehouse {suffix}", Timezone = "Asia/Ho_Chi_Minh",
            IsActive = true, CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
        return warehouseId;
    }

    private async Task<MapDto> CreateDraftAsync(Guid warehouseId, string mapUri = "/map-assets/map.pgm")
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Floor", mapUri, resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MapDto>())!;
    }

    private async Task<EndpointDto> AddEndpointAsync(Guid mapId, string name, double x = 1, string type = "WAYPOINT")
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints",
            new { name, endpointType = type, x, y = 2.0, yaw = 1.57, positionTolerance = 0.15, yawTolerance = 0.25 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EndpointDto>())!;
    }

    private async Task PublishAsync(Guid mapId) =>
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

    private async Task<MapDto> CloneAsync(Guid mapId, string? name = null)
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/clone", new { name });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<MapDto>())!;
    }

    private Task<DetailDto> DetailAsync(Guid mapId) => Client.GetFromJsonAsync<DetailDto>($"/api/navigation/maps/{mapId}/detail")!;

    private async Task<StorageLocation> SeedLocationAsync(Guid warehouseId, Guid endpointId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var location = new StorageLocation
        {
            Id = Guid.NewGuid(), WarehouseId = warehouseId, EndpointId = endpointId, Code = $"LOC-{Guid.NewGuid():N}"[..12],
            Name = "Shelf", IsActive = true, CreatedAt = DateTimeOffset.UtcNow
        };
        db.StorageLocations.Add(location);
        await db.SaveChangesAsync();
        return location;
    }

    private async Task<Guid> LocationEndpointAsync(Guid locationId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        return await db.StorageLocations.AsNoTracking().Where(l => l.Id == locationId).Select(l => l.EndpointId).SingleAsync();
    }

    /// <summary>Published map with 2 endpoints, a zone and an edge: the usual thing to clone.</summary>
    private async Task<(MapDto Map, EndpointDto Shelf, EndpointDto Inbound)> PublishedMapAsync(Guid warehouseId)
    {
        var map = await CreateDraftAsync(warehouseId);
        var shelf = await AddEndpointAsync(map.Id, "Shelf 01", 1.0);
        var inbound = await AddEndpointAsync(map.Id, "Inbound", 3.0);
        (await Client.PostAsJsonAsync($"/api/navigation/maps/{map.Id}/zones",
            new { name = "Shelf area", zoneType = "SPEED", geometry = Square, capacity = 1, maxSpeed = 0.2, isActive = true })).EnsureSuccessStatusCode();
        (await Client.PostAsJsonAsync($"/api/navigation/maps/{map.Id}/edges", new
        {
            geometry = new { type = "LineString", coordinates = new[] { new[] { 1.0, 2.0 }, new[] { 3.0, 2.0 } } },
            widthMeters = 0.6, direction = "ONE_WAY", capacity = 1, maxSpeed = 0.3
        })).EnsureSuccessStatusCode();
        await PublishAsync(map.Id);
        return (map, shelf, inbound);
    }

    [Fact]
    public async Task Clone_copies_the_map_into_an_editable_draft_with_new_codes()
    {
        var warehouseId = await SeedWarehouseAsync();
        var (source, shelf, inbound) = await PublishedMapAsync(warehouseId);

        var clone = await CloneAsync(source.Id);

        Assert.Equal("DRAFT", clone.Status);
        Assert.Equal(source.VersionNo + 1, clone.VersionNo);
        Assert.NotEqual(source.Code, clone.Code);
        Assert.Equal("Copy of Floor", clone.Name);
        Assert.Equal(source.MapUri, clone.MapUri);                 // same occupancy image
        Assert.Equal(source.Id, clone.SourceMapVersionId);

        var copied = await DetailAsync(clone.Id);
        var original = await DetailAsync(source.Id);
        Assert.Equal(source.Code, copied.SourceMapVersionCode);
        Assert.Equal(["Inbound", "Shelf 01"], copied.Endpoints.Select(e => e.Name).Order());
        var copiedShelf = copied.Endpoints.Single(e => e.Name == "Shelf 01");
        Assert.NotEqual(shelf.Id, copiedShelf.Id);
        Assert.Equal("EP-SHELF-01", copiedShelf.Code);              // generated by the system code generator (EP-{NAME})
        Assert.Equal((shelf.X, shelf.Y, shelf.Yaw, shelf.EndpointType), (copiedShelf.X, copiedShelf.Y, copiedShelf.Yaw, copiedShelf.EndpointType));
        Assert.Single(copied.Zones);
        Assert.Equal("ZONE-SHELF-AREA", copied.Zones[0].Code);                // ZONE-{NAME}
        Assert.NotEqual(original.Zones[0].Id, copied.Zones[0].Id);
        Assert.Equal(original.Zones[0].Geometry.GetRawText(), copied.Zones[0].Geometry.GetRawText());
        Assert.Single(copied.Edges);
        Assert.NotEqual(original.Edges[0].Code, copied.Edges[0].Code);      // EDGE-nnn: system-wide sequence
        Assert.Equal("ONE_WAY", copied.Edges[0].Direction);

        Assert.Equal("PUBLISHED", original.Status);                 // source untouched
        Assert.Equal(2, original.Endpoints.Count);
        Assert.Contains(original.Endpoints, e => e.Id == inbound.Id && e.Code == inbound.Code);

        // The copy is editable like any DRAFT.
        await AddEndpointAsync(clone.Id, "Charger", 5.0, "CHARGER");
        Assert.Equal(3, (await DetailAsync(clone.Id)).Endpoints.Count);
    }

    [Fact]
    public async Task Publishing_the_clone_moves_storage_locations_to_the_copied_endpoints()
    {
        var warehouseId = await SeedWarehouseAsync();
        var (source, shelf, _) = await PublishedMapAsync(warehouseId);
        var location = await SeedLocationAsync(warehouseId, shelf.Id);
        var clone = await CloneAsync(source.Id, "Floor v2");
        await AddEndpointAsync(clone.Id, "New shelf", 4.0);

        Assert.Equal(shelf.Id, await LocationEndpointAsync(location.Id));   // nothing moves while DRAFT
        await PublishAsync(clone.Id);

        var copiedShelf = (await DetailAsync(clone.Id)).Endpoints.Single(e => e.Name == "Shelf 01");
        Assert.Equal(copiedShelf.Id, await LocationEndpointAsync(location.Id));
        Assert.Equal("ARCHIVED", (await DetailAsync(source.Id)).Status);
    }

    [Fact]
    public async Task A_clone_of_a_clone_still_carries_the_storage_location()
    {
        var warehouseId = await SeedWarehouseAsync();
        var (source, shelf, _) = await PublishedMapAsync(warehouseId);
        var location = await SeedLocationAsync(warehouseId, shelf.Id);
        var first = await CloneAsync(source.Id);                     // never published
        var second = await CloneAsync(first.Id);

        await PublishAsync(second.Id);

        var finalShelf = (await DetailAsync(second.Id)).Endpoints.Single(e => e.Name == "Shelf 01");
        Assert.Equal(finalShelf.Id, await LocationEndpointAsync(location.Id));
    }

    [Fact]
    public async Task Clone_needs_the_map_image()
    {
        var warehouseId = await SeedWarehouseAsync();
        var created = await Client.PostAsJsonAsync($"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "No image", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        created.EnsureSuccessStatusCode();
        var map = (await created.Content.ReadFromJsonAsync<MapDto>())!;

        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{map.Id}/clone", new { name = (string?)null });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("map_assets_pending", json.RootElement.GetProperty("code").GetString());
    }
}
