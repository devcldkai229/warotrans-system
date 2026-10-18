using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Persistence;
using WarehouseEntity = WaroTrans.Warehouse.Entities.Warehouse;

namespace WaroTrans.IntegrationTests.Warehouse.ListInventory;

public sealed record InventoryItemDto(
    Guid Id,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    Guid StorageLocationId,
    string StorageLocationCode,
    string StorageLocationName,
    short LevelNo,
    int ContainerCount,
    DateTimeOffset UpdatedAt);

public sealed record ListInventoryDto(IReadOnlyList<InventoryItemDto> Items, int Total);

[Collection(IntegrationCollection.Name)]
public sealed class ListInventoryEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private async Task<(HttpClient Client, string Token)> SignInAsync(AccountRole role = AccountRole.ADMIN, string username = "boss")
    {
        await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        return (client, (await client.LoginAsync(username)).AccessToken);
    }

    private async Task<T> WithDbAsync<T>(Func<WarehouseDbContext, Task<T>> action)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<WarehouseDbContext>());
    }

    private Task<WarehouseEntity> SeedWarehouseAsync(string code) => WithDbAsync(async db =>
    {
        var warehouse = new WarehouseEntity
        {
            Id = Guid.NewGuid(), Code = code, Name = code, Timezone = "Asia/Ho_Chi_Minh", IsActive = true, CreatedAt = DateTimeOffset.UtcNow
        };
        db.Warehouses.Add(warehouse);
        await db.SaveChangesAsync();
        return warehouse;
    });

    private Task<Product> SeedProductAsync(string sku, string name) => WithDbAsync(async db =>
    {
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = $"C-{Guid.NewGuid():N}"[..12], Name = "Group" };
        var now = DateTimeOffset.UtcNow;
        var product = new Product { Id = Guid.NewGuid(), CategoryId = category.Id, Sku = sku, Name = name, IsActive = true, CreatedAt = now, UpdatedAt = now };
        db.ProductCategories.Add(category);
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product;
    });

    private Task<StorageLocation> SeedLocationAsync(Guid warehouseId, string code, string name) => WithDbAsync(async db =>
    {
        var location = new StorageLocation
        {
            Id = Guid.NewGuid(), WarehouseId = warehouseId, EndpointId = Guid.NewGuid(), Code = code, Name = name,
            IsActive = true, CreatedAt = DateTimeOffset.UtcNow
        };
        db.StorageLocations.Add(location);
        await db.SaveChangesAsync();
        return location;
    });

    private Task SeedStockAsync(Product product, StorageLocation location, short level, int count) => WithDbAsync(async db =>
    {
        db.InventoryStocks.Add(new InventoryStock
        {
            Id = Guid.NewGuid(), ProductId = product.Id, StorageLocationId = location.Id, LevelNo = level,
            ContainerCount = count, UpdatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
        return 0;
    });

    private static string Url(Guid warehouseId, string query = "") => $"/api/warehouse/inventory?warehouseId={warehouseId}{query}";

    private static async Task<ListInventoryDto> ReadAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ListInventoryDto>())!;
    }

    [Fact]
    public async Task List_returns_stock_rows_with_product_and_location_names_ordered_by_sku_location_and_level()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var carton = await SeedProductAsync("SKU-B", "Carton Box");
        var sensor = await SeedProductAsync("SKU-A", "Optical Sensor");
        var shelf1 = await SeedLocationAsync(warehouse.Id, "SHELF-1", "Shelf One");
        var shelf2 = await SeedLocationAsync(warehouse.Id, "SHELF-2", "Shelf Two");
        await SeedStockAsync(carton, shelf1, 2, 5);
        await SeedStockAsync(sensor, shelf2, 1, 3);
        await SeedStockAsync(sensor, shelf1, 3, 1);
        await SeedStockAsync(sensor, shelf1, 1, 4);

        var body = await ReadAsync(await client.GetWithTokenAsync(Url(warehouse.Id), token));

        Assert.Equal(4, body.Total);
        Assert.Equal(
            ["SKU-A|SHELF-1|1", "SKU-A|SHELF-1|3", "SKU-A|SHELF-2|1", "SKU-B|SHELF-1|2"],
            body.Items.Select(i => $"{i.ProductSku}|{i.StorageLocationCode}|{i.LevelNo}"));
        var first = body.Items[0];
        Assert.Equal("Optical Sensor", first.ProductName);
        Assert.Equal("Shelf One", first.StorageLocationName);
        Assert.Equal(4, first.ContainerCount);
        Assert.True(first.UpdatedAt > DateTimeOffset.UtcNow.AddMinutes(-5));
    }

    [Fact]
    public async Task List_only_returns_stock_of_the_requested_warehouse()
    {
        var (client, token) = await SignInAsync();
        var warehouseA = await SeedWarehouseAsync("WH-A");
        var warehouseB = await SeedWarehouseAsync("WH-B");
        var product = await SeedProductAsync("SKU-1", "Carton");
        await SeedStockAsync(product, await SeedLocationAsync(warehouseA.Id, "SHELF-A", "A"), 1, 2);
        await SeedStockAsync(product, await SeedLocationAsync(warehouseB.Id, "SHELF-B", "B"), 1, 9);

        var inA = await ReadAsync(await client.GetWithTokenAsync(Url(warehouseA.Id), token));

        Assert.Equal(["SHELF-A"], inA.Items.Select(i => i.StorageLocationCode));
        Assert.Equal(1, inA.Total);
    }

    [Fact]
    public async Task List_searches_sku_product_name_and_location_in_any_letter_case()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var carton = await SeedProductAsync("SKU-CARTON", "Carton Box");
        var sensor = await SeedProductAsync("SKU-SENSOR", "Optical Sensor");
        var shelf = await SeedLocationAsync(warehouse.Id, "RACK-9", "North Rack");
        var dock = await SeedLocationAsync(warehouse.Id, "DOCK-1", "Loading Dock");
        await SeedStockAsync(carton, shelf, 1, 1);
        await SeedStockAsync(sensor, dock, 1, 1);

        async Task<string[]> Find(string term) =>
            (await ReadAsync(await client.GetWithTokenAsync(Url(warehouse.Id, $"&search={term}"), token)))
            .Items.Select(i => i.ProductSku).ToArray();

        Assert.Equal(["SKU-CARTON"], await Find("sku-carton"));
        Assert.Equal(["SKU-SENSOR"], await Find("OPTICAL"));
        Assert.Equal(["SKU-CARTON"], await Find("rack-9"));
        Assert.Equal(["SKU-SENSOR"], await Find("loading"));
        Assert.Empty(await Find("nothing"));
    }

    [Fact]
    public async Task List_pages_and_reports_the_total()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var shelf = await SeedLocationAsync(warehouse.Id, "SHELF", "Shelf");
        foreach (var sku in new[] { "S1", "S2", "S3" })
        {
            await SeedStockAsync(await SeedProductAsync(sku, sku), shelf, 1, 1);
        }

        var body = await ReadAsync(await client.GetWithTokenAsync(Url(warehouse.Id, "&skip=1&take=1"), token));

        Assert.Equal(["S2"], body.Items.Select(i => i.ProductSku));
        Assert.Equal(3, body.Total);
    }

    [Fact]
    public async Task List_of_a_warehouse_without_stock_is_empty()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");

        var body = await ReadAsync(await client.GetWithTokenAsync(Url(warehouse.Id), token));

        Assert.Empty(body.Items);
        Assert.Equal(0, body.Total);
    }

    [Theory]
    [InlineData("&take=0")]
    [InlineData("&take=501")]
    [InlineData("&skip=-1")]
    public async Task List_with_a_bad_page_returns_400(string query)
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");

        var response = await client.GetWithTokenAsync(Url(warehouse.Id, query), token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task List_without_a_warehouse_id_returns_400()
    {
        var (client, token) = await SignInAsync();

        var response = await client.GetWithTokenAsync("/api/warehouse/inventory", token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task List_is_open_to_staff_but_not_to_anonymous_callers()
    {
        var (staff, token) = await SignInAsync(AccountRole.STAFF, "sam");
        var warehouse = await SeedWarehouseAsync("WH-A");

        var asStaff = await staff.GetWithTokenAsync(Url(warehouse.Id), token);
        var anonymous = await CreateAnonymousClient().GetAsync(Url(warehouse.Id));

        Assert.Equal(HttpStatusCode.OK, asStaff.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }
}
