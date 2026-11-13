using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Navigation.Maps;

/// <summary>
/// The map editor marks an Endpoint as a storage location. A location may only point at an Endpoint of the published
/// map, so a mark made in a DRAFT is kept on the Endpoint and the location is created when that map is published.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class EndpointStorageLocationTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private sealed record MapDto(Guid Id, string Status);

    private sealed record StorageDto(string Code, string Name, string State, bool IsActive);

    private sealed record EndpointDto(Guid Id, string Code, string Name, string EndpointType, string? StorageLocationCode);

    private sealed record DetailEndpointDto(Guid Id, string Code, string Name, StorageDto? StorageLocation);

    private sealed record DetailDto(Guid Id, string Status, List<DetailEndpointDto> Endpoints);

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

    private async Task<MapDto> CreateDraftAsync(Guid warehouseId)
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Floor", mapUri = "/map-assets/map.pgm", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MapDto>())!;
    }

    private Task<HttpResponseMessage> PostEndpointAsync(Guid mapId, string name, string? storageCode, string type = "WAYPOINT") =>
        Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", new
        {
            name, endpointType = type, x = 1.0, y = 2.0, yaw = 0.0, positionTolerance = 0.15, yawTolerance = 0.25,
            storageLocationCode = storageCode
        });

    private async Task<EndpointDto> AddEndpointAsync(Guid mapId, string name, string? storageCode = null)
    {
        var response = await PostEndpointAsync(mapId, name, storageCode);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EndpointDto>())!;
    }

    private Task<HttpResponseMessage> PutEndpointAsync(Guid endpointId, string name, string? storageCode) =>
        Client.PutAsJsonAsync($"/api/navigation/endpoints/{endpointId}", new
        {
            name, endpointType = "WAYPOINT", x = 1.0, y = 2.0, yaw = 0.0, positionTolerance = 0.15, yawTolerance = 0.25,
            isEnabled = true, storageLocationCode = storageCode
        });

    private Task<HttpResponseMessage> PublishAsync(Guid mapId) => Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null);

    private async Task<MapDto> CloneAsync(Guid mapId)
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/clone", new { name = (string?)null });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MapDto>())!;
    }

    private Task<DetailDto> DetailAsync(Guid mapId) => Client.GetFromJsonAsync<DetailDto>($"/api/navigation/maps/{mapId}/detail")!;

    private async Task<List<StorageLocation>> LocationsAsync(Guid warehouseId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        return await db.StorageLocations.AsNoTracking().Where(l => l.WarehouseId == warehouseId).OrderBy(l => l.Code).ToListAsync();
    }

    private async Task SeedLocationAsync(Guid warehouseId, Guid endpointId, string code)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        db.StorageLocations.Add(new StorageLocation
        {
            Id = Guid.NewGuid(), WarehouseId = warehouseId, EndpointId = endpointId, Code = code, Name = "Shelf",
            IsActive = true, CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task A_marked_endpoint_gets_its_storage_location_when_the_map_is_published()
    {
        var warehouseId = await SeedWarehouseAsync();
        var map = await CreateDraftAsync(warehouseId);
        var shelf = await AddEndpointAsync(map.Id, "Shelf D 01", " shelf-d-01 ");
        await AddEndpointAsync(map.Id, "Inbound");

        Assert.Equal("SHELF-D-01", shelf.StorageLocationCode);          // trimmed, upper case
        var draft = await DetailAsync(map.Id);
        Assert.Equal(new StorageDto("SHELF-D-01", "Shelf D 01", "PENDING", true), draft.Endpoints.Single(e => e.Id == shelf.Id).StorageLocation);
        Assert.Null(draft.Endpoints.Single(e => e.Name == "Inbound").StorageLocation);
        Assert.Empty(await LocationsAsync(warehouseId));               // nothing exists while DRAFT

        (await PublishAsync(map.Id)).EnsureSuccessStatusCode();

        var location = Assert.Single(await LocationsAsync(warehouseId));
        Assert.Equal(("SHELF-D-01", "Shelf D 01", shelf.Id, true), (location.Code, location.Name, location.EndpointId, location.IsActive));
        var published = await DetailAsync(map.Id);
        Assert.Equal(new StorageDto("SHELF-D-01", "Shelf D 01", "LINKED", true), published.Endpoints.Single(e => e.Id == shelf.Id).StorageLocation);
    }

    [Fact]
    public async Task A_clone_shows_the_location_it_takes_over_and_keeps_new_marks()
    {
        var warehouseId = await SeedWarehouseAsync();
        var map = await CreateDraftAsync(warehouseId);
        await AddEndpointAsync(map.Id, "Shelf A", "SHELF-A");
        (await PublishAsync(map.Id)).EnsureSuccessStatusCode();

        var clone = await CloneAsync(map.Id);
        var added = await AddEndpointAsync(clone.Id, "Shelf B", "SHELF-B");
        var draft = await DetailAsync(clone.Id);
        Assert.Equal("INHERITED", draft.Endpoints.Single(e => e.Name == "Shelf A").StorageLocation?.State);
        Assert.Equal("PENDING", draft.Endpoints.Single(e => e.Id == added.Id).StorageLocation?.State);

        (await PublishAsync(clone.Id)).EnsureSuccessStatusCode();

        var published = await DetailAsync(clone.Id);
        Assert.All(published.Endpoints, e => Assert.Equal("LINKED", e.StorageLocation?.State));
        Assert.Equal(["SHELF-A", "SHELF-B"], (await LocationsAsync(warehouseId)).Select(l => l.Code));
        var shelfA = published.Endpoints.Single(e => e.Name == "Shelf A");
        Assert.Equal(shelfA.Id, (await LocationsAsync(warehouseId)).Single(l => l.Code == "SHELF-A").EndpointId);
    }

    [Fact]
    public async Task An_endpoint_that_takes_over_a_location_cannot_be_marked_again()
    {
        var warehouseId = await SeedWarehouseAsync();
        var map = await CreateDraftAsync(warehouseId);
        await AddEndpointAsync(map.Id, "Shelf A", "SHELF-A");
        (await PublishAsync(map.Id)).EnsureSuccessStatusCode();
        var clone = await CloneAsync(map.Id);
        var copied = (await DetailAsync(clone.Id)).Endpoints.Single();

        var response = await PutEndpointAsync(copied.Id, "Shelf A", "SHELF-A2");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("endpoint_already_storage_location", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_code_already_used_in_the_warehouse_or_on_the_map_is_refused()
    {
        var warehouseId = await SeedWarehouseAsync();
        var map = await CreateDraftAsync(warehouseId);
        await SeedLocationAsync(warehouseId, Guid.NewGuid(), "SHELF-X");
        await AddEndpointAsync(map.Id, "Shelf Y", "SHELF-Y");

        var usedInWarehouse = await PostEndpointAsync(map.Id, "Shelf X", "shelf-x");
        var usedOnMap = await PostEndpointAsync(map.Id, "Shelf Y2", "SHELF-Y");

        Assert.Equal("storage_location_code_used", await usedInWarehouse.ReadErrorCodeAsync());
        Assert.Equal("storage_location_code_used", await usedOnMap.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Only_an_enabled_waypoint_can_be_marked()
    {
        var warehouseId = await SeedWarehouseAsync();
        var map = await CreateDraftAsync(warehouseId);

        var charger = await PostEndpointAsync(map.Id, "Charger", "SHELF-C", "CHARGER");

        Assert.Equal(HttpStatusCode.BadRequest, charger.StatusCode);
        Assert.Equal("storage_location_needs_waypoint", await charger.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Removing_the_mark_in_the_draft_creates_nothing()
    {
        var warehouseId = await SeedWarehouseAsync();
        var map = await CreateDraftAsync(warehouseId);
        var shelf = await AddEndpointAsync(map.Id, "Shelf A", "SHELF-A");

        var updated = await PutEndpointAsync(shelf.Id, "Shelf A", null);
        updated.EnsureSuccessStatusCode();
        (await PublishAsync(map.Id)).EnsureSuccessStatusCode();

        Assert.Empty(await LocationsAsync(warehouseId));
        Assert.Null((await DetailAsync(map.Id)).Endpoints.Single().StorageLocation);
    }

    [Fact]
    public async Task Publishing_is_refused_when_a_marked_code_was_taken_meanwhile()
    {
        var warehouseId = await SeedWarehouseAsync();
        var map = await CreateDraftAsync(warehouseId);
        await AddEndpointAsync(map.Id, "Shelf A", "SHELF-A");
        await SeedLocationAsync(warehouseId, Guid.NewGuid(), "SHELF-A");   // created on the Management page meanwhile

        var response = await PublishAsync(map.Id);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("storage_location_code_used", await response.ReadErrorCodeAsync());
        Assert.Equal("DRAFT", (await DetailAsync(map.Id)).Status);
    }
}
