using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using NavEndpoint = WaroTrans.Navigation.Entities.Endpoint;
using NavMapVersion = WaroTrans.Navigation.Entities.MapVersion;
using WarehouseEntity = WaroTrans.Warehouse.Entities.Warehouse;

namespace WaroTrans.IntegrationTests.Warehouse.StorageLocations;

public sealed record StorageLocationDto(
    Guid Id,
    Guid WarehouseId,
    Guid EndpointId,
    string Code,
    string Name,
    bool IsActive,
    string WarehouseName,
    string? EndpointCode,
    string? EndpointName,
    string? EndpointType,
    DateTimeOffset CreatedAt);

public sealed record ListStorageLocationsDto(IReadOnlyList<StorageLocationDto> Items, int Total);

/// <summary>
/// Storage locations: each points at one Endpoint of the warehouse's published map, which Navigation owns, so the
/// tests build maps and endpoints through the Navigation database.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class StorageLocationEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private const string Locations = "/api/warehouse/storage-locations";

    private async Task<(HttpClient Client, string Token)> SignInAsync(AccountRole role = AccountRole.ADMIN, string username = "boss")
    {
        await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        return (client, (await client.LoginAsync(username)).AccessToken);
    }

    private async Task<T> WithAsync<TContext, T>(Func<TContext, Task<T>> action) where TContext : notnull
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<TContext>());
    }

    private Task<WarehouseEntity> SeedWarehouseAsync(string code, bool isActive = true) => WithAsync<WarehouseDbContext, WarehouseEntity>(async db =>
    {
        var warehouse = new WarehouseEntity
        {
            Id = Guid.NewGuid(), Code = code, Name = $"Warehouse {code}", Timezone = "Asia/Ho_Chi_Minh", IsActive = isActive,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Warehouses.Add(warehouse);
        await db.SaveChangesAsync();
        return warehouse;
    });

    private Task<NavMapVersion> SeedMapAsync(Guid warehouseId, MapStatus status, int versionNo = 1) => WithAsync<NavigationDbContext, NavMapVersion>(async db =>
    {
        var map = new NavMapVersion
        {
            Id = Guid.NewGuid(), WarehouseId = warehouseId, Code = $"MAP-{Guid.NewGuid():N}"[..14], VersionNo = versionNo,
            Name = "Test map", Status = status, MapUri = "map.pgm", Resolution = 0.05, CreatedAt = DateTimeOffset.UtcNow,
            PublishedAt = status == MapStatus.PUBLISHED ? DateTimeOffset.UtcNow : null
        };
        db.MapVersions.Add(map);
        await db.SaveChangesAsync();
        return map;
    });

    private Task<NavEndpoint> SeedEndpointAsync(Guid mapVersionId, string code, string name, EndpointType type = EndpointType.STORAGE, bool enabled = true) =>
        WithAsync<NavigationDbContext, NavEndpoint>(async db =>
        {
            var endpoint = new NavEndpoint
            {
                Id = Guid.NewGuid(), MapVersionId = mapVersionId, Code = code, Name = name, EndpointType = type,
                X = 1, Y = 1, Yaw = 0, PositionTolerance = 0.1, YawTolerance = 0.1, IsEnabled = enabled
            };
            db.Endpoints.Add(endpoint);
            await db.SaveChangesAsync();
            return endpoint;
        });

    private Task<StorageLocation> SeedLocationAsync(Guid warehouseId, Guid endpointId, string code, bool isActive = true) =>
        WithAsync<WarehouseDbContext, StorageLocation>(async db =>
        {
            var location = new StorageLocation
            {
                Id = Guid.NewGuid(), WarehouseId = warehouseId, EndpointId = endpointId, Code = code, Name = code,
                IsActive = isActive, CreatedAt = DateTimeOffset.UtcNow
            };
            db.StorageLocations.Add(location);
            await db.SaveChangesAsync();
            return location;
        });

    private Task SeedContainerAsync(Guid locationId) => WithAsync<WarehouseDbContext, int>(async db =>
    {
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = "C", Name = "C" };
        var now = DateTimeOffset.UtcNow;
        var product = new Product { Id = Guid.NewGuid(), CategoryId = category.Id, Sku = "SKU", Name = "Item", IsActive = true, CreatedAt = now, UpdatedAt = now };
        db.ProductCategories.Add(category);
        db.Products.Add(product);
        db.Containers.Add(new Container
        {
            Id = Guid.NewGuid(), ProductId = product.Id, Barcode = "CTN-1", Status = ContainerStatus.STORED,
            CurrentStorageLocationId = locationId, CurrentLevelNo = 1, CreatedBy = Guid.NewGuid(), CreatedAt = now, UpdatedAt = now
        });
        await db.SaveChangesAsync();
        return 0;
    });

    private static object Body(Guid warehouseId, Guid endpointId, string code = "shelf-a1", string name = "Shelf A1") =>
        new { warehouseId, endpointId, code, name };

    /// <summary>A warehouse with a published map and one enabled endpoint, the usual starting point.</summary>
    private async Task<(WarehouseEntity Warehouse, NavEndpoint Endpoint)> SeedReadyWarehouseAsync(string code = "WH-A")
    {
        var warehouse = await SeedWarehouseAsync(code);
        var map = await SeedMapAsync(warehouse.Id, MapStatus.PUBLISHED);
        var endpoint = await SeedEndpointAsync(map.Id, $"EP-{code}-1", "Rack A-01");
        return (warehouse, endpoint);
    }

    private static async Task<StorageLocationDto> ReadLocationAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<StorageLocationDto>())!;

    /* ------------------------------------------------------------------------------------------ create */

    [Fact]
    public async Task Create_stores_an_active_location_with_an_upper_case_code_and_returns_the_endpoint_and_warehouse_names()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync();

        var response = await client.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(warehouse.Id, endpoint.Id, "  shelf-a1 ", " Shelf A1 "));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await ReadLocationAsync(response);
        Assert.Equal("SHELF-A1", created.Code);
        Assert.Equal("Shelf A1", created.Name);
        Assert.True(created.IsActive);
        Assert.Equal("Warehouse WH-A", created.WarehouseName);
        Assert.Equal(endpoint.Code, created.EndpointCode);
        Assert.Equal("Rack A-01", created.EndpointName);
        Assert.Equal("STORAGE", created.EndpointType);

        var list = (await (await client.GetWithTokenAsync($"{Locations}?warehouseId={warehouse.Id}", token))
            .Content.ReadFromJsonAsync<ListStorageLocationsDto>())!;
        Assert.Equal(["SHELF-A1"], list.Items.Select(l => l.Code));
    }

    [Fact]
    public async Task Create_as_staff_returns_403_and_without_a_token_401()
    {
        var (staff, token) = await SignInAsync(AccountRole.STAFF, "sam");
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync();

        var asStaff = await staff.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(warehouse.Id, endpoint.Id));
        var anonymous = await CreateAnonymousClient().PostAsJsonAsync(Locations, Body(warehouse.Id, endpoint.Id));

        Assert.Equal(HttpStatusCode.Forbidden, asStaff.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    [Fact]
    public async Task Create_in_an_unknown_warehouse_returns_404_and_in_an_inactive_one_400()
    {
        var (client, token) = await SignInAsync();
        var inactive = await SeedWarehouseAsync("WH-OFF", isActive: false);
        var map = await SeedMapAsync(inactive.Id, MapStatus.PUBLISHED);
        var endpoint = await SeedEndpointAsync(map.Id, "EP-1", "Rack");

        var unknown = await client.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(Guid.NewGuid(), endpoint.Id));
        var off = await client.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(inactive.Id, endpoint.Id));

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("warehouse_not_found", await unknown.ReadErrorCodeAsync());
        Assert.Equal(HttpStatusCode.BadRequest, off.StatusCode);
        Assert.Equal("warehouse_inactive", await off.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Create_needs_an_endpoint_on_the_published_map_of_that_warehouse()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var other = await SeedWarehouseAsync("WH-B");
        var draftMap = await SeedMapAsync(warehouse.Id, MapStatus.DRAFT);
        var draftEndpoint = await SeedEndpointAsync(draftMap.Id, "EP-DRAFT", "Draft rack");
        var otherMap = await SeedMapAsync(other.Id, MapStatus.PUBLISHED);
        var otherEndpoint = await SeedEndpointAsync(otherMap.Id, "EP-OTHER", "Other rack");

        foreach (var endpointId in new[] { draftEndpoint.Id, otherEndpoint.Id, Guid.NewGuid() })
        {
            var response = await client.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(warehouse.Id, endpointId));

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("endpoint_not_on_published_map", await response.ReadErrorCodeAsync());
        }
    }

    [Fact]
    public async Task Create_refuses_a_disabled_endpoint()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var map = await SeedMapAsync(warehouse.Id, MapStatus.PUBLISHED);
        var endpoint = await SeedEndpointAsync(map.Id, "EP-OFF", "Off rack", enabled: false);

        var response = await client.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(warehouse.Id, endpoint.Id));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("endpoint_disabled", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Create_with_a_taken_code_returns_409_but_the_same_code_in_another_warehouse_is_fine()
    {
        var (client, token) = await SignInAsync();
        var (warehouseA, endpointA) = await SeedReadyWarehouseAsync("WH-A");
        var (warehouseB, endpointB) = await SeedReadyWarehouseAsync("WH-B");
        await SeedLocationAsync(warehouseA.Id, endpointA.Id, "SHELF-A1");
        var spare = await SeedEndpointAsync(endpointA.MapVersionId, "EP-WH-A-2", "Rack A-02");

        var clash = await client.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(warehouseA.Id, spare.Id, "shelf-a1"));
        var otherWarehouse = await client.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(warehouseB.Id, endpointB.Id, "shelf-a1"));

        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        Assert.Equal("storage_location_code_taken", await clash.ReadErrorCodeAsync());
        Assert.Equal(HttpStatusCode.Created, otherWarehouse.StatusCode);
    }

    [Fact]
    public async Task Create_with_an_endpoint_that_already_serves_a_location_returns_409()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync();
        await SeedLocationAsync(warehouse.Id, endpoint.Id, "SHELF-A1");

        var response = await client.SendWithTokenAsync(HttpMethod.Post, Locations, token, Body(warehouse.Id, endpoint.Id, "SHELF-A2"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("endpoint_already_used", await response.ReadErrorCodeAsync());
    }

    [Theory]
    [InlineData("", "Name", false)]
    [InlineData("CODE", "", false)]
    [InlineData("CODE", "Name", true)] // empty endpoint id
    public async Task Create_with_invalid_input_returns_400(string code, string name, bool emptyEndpoint)
    {
        var (client, token) = await SignInAsync();
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync();

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, Locations, token, Body(warehouse.Id, emptyEndpoint ? Guid.Empty : endpoint.Id, code, name));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /* ------------------------------------------------------------------------------------------- list */

    [Fact]
    public async Task List_hides_inactive_locations_by_default_and_is_scoped_to_the_warehouse()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync("WH-A");
        var second = await SeedEndpointAsync(endpoint.MapVersionId, "EP-WH-A-2", "Rack A-02");
        var (other, otherEndpoint) = await SeedReadyWarehouseAsync("WH-B");
        await SeedLocationAsync(warehouse.Id, endpoint.Id, "B-ON");
        await SeedLocationAsync(warehouse.Id, second.Id, "A-OFF", isActive: false);
        await SeedLocationAsync(other.Id, otherEndpoint.Id, "C-OTHER");

        var active = (await (await client.GetWithTokenAsync($"{Locations}?warehouseId={warehouse.Id}", token))
            .Content.ReadFromJsonAsync<ListStorageLocationsDto>())!;
        var all = (await (await client.GetWithTokenAsync($"{Locations}?warehouseId={warehouse.Id}&activeOnly=false", token))
            .Content.ReadFromJsonAsync<ListStorageLocationsDto>())!;

        Assert.Equal(["B-ON"], active.Items.Select(l => l.Code));
        Assert.Equal(["A-OFF", "B-ON"], all.Items.Select(l => l.Code));
        Assert.Equal(2, all.Total);
        Assert.Equal("Rack A-02", all.Items[0].EndpointName);
    }

    [Fact]
    public async Task List_leaves_the_endpoint_names_empty_when_navigation_does_not_know_the_endpoint()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        await SeedLocationAsync(warehouse.Id, Guid.NewGuid(), "ORPHAN");

        var body = (await (await client.GetWithTokenAsync($"{Locations}?warehouseId={warehouse.Id}", token))
            .Content.ReadFromJsonAsync<ListStorageLocationsDto>())!;

        Assert.Single(body.Items);
        Assert.Null(body.Items[0].EndpointCode);
        Assert.Null(body.Items[0].EndpointName);
    }

    /* ----------------------------------------------------------------------------------------- status */

    [Fact]
    public async Task Deactivate_and_reactivate_an_empty_location()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync();
        var location = await SeedLocationAsync(warehouse.Id, endpoint.Id, "SHELF-A1");

        var off = await client.SendWithTokenAsync(HttpMethod.Post, $"{Locations}/{location.Id}/status", token, new { isActive = false });

        Assert.Equal(HttpStatusCode.OK, off.StatusCode);
        var inactive = await ReadLocationAsync(off);
        Assert.False(inactive.IsActive);
        Assert.Equal(endpoint.Code, inactive.EndpointCode);

        var on = await client.SendWithTokenAsync(HttpMethod.Post, $"{Locations}/{location.Id}/status", token, new { isActive = true });
        Assert.True((await ReadLocationAsync(on)).IsActive);
    }

    [Fact]
    public async Task Deactivate_is_refused_while_the_location_holds_containers()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync();
        var location = await SeedLocationAsync(warehouse.Id, endpoint.Id, "SHELF-A1");
        await SeedContainerAsync(location.Id);

        var response = await client.SendWithTokenAsync(HttpMethod.Post, $"{Locations}/{location.Id}/status", token, new { isActive = false });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("storage_location_in_use", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Setting_the_status_a_location_already_has_is_accepted()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync();
        var location = await SeedLocationAsync(warehouse.Id, endpoint.Id, "SHELF-A1");

        var response = await client.SendWithTokenAsync(HttpMethod.Post, $"{Locations}/{location.Id}/status", token, new { isActive = true });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Status_of_an_unknown_location_returns_404_and_as_staff_403()
    {
        var (admin, adminToken) = await SignInAsync();
        var (staff, staffToken) = await SignInAsync(AccountRole.STAFF, "sam");
        var (warehouse, endpoint) = await SeedReadyWarehouseAsync();
        var location = await SeedLocationAsync(warehouse.Id, endpoint.Id, "SHELF-A1");

        var unknown = await admin.SendWithTokenAsync(HttpMethod.Post, $"{Locations}/{Guid.NewGuid()}/status", adminToken, new { isActive = false });
        var asStaff = await staff.SendWithTokenAsync(HttpMethod.Post, $"{Locations}/{location.Id}/status", staffToken, new { isActive = false });

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("storage_location_not_found", await unknown.ReadErrorCodeAsync());
        Assert.Equal(HttpStatusCode.Forbidden, asStaff.StatusCode);
    }
}
