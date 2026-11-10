using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WarehouseEntity = WaroTrans.Warehouse.Entities.Warehouse;

namespace WaroTrans.IntegrationTests.Warehouse.Receiving;

public sealed record ResolvedProductDto(Guid Id, string Sku, string? SupplierBarcode, string Name, bool IsActive);

public sealed record ResolveProductDto(ResolvedProductDto? ExactMatch, IReadOnlyList<ResolvedProductDto> Items);

public sealed record LocationStockDto(Guid StorageLocationId, string StorageLocationCode, short LevelNo, int ContainerCount);

public sealed record InventoryContextDto(
    Guid ProductId,
    string Sku,
    int TotalContainers,
    Dictionary<string, int> ContainersByStatus,
    IReadOnlyList<LocationStockDto> StorageLocations);

/// <summary>The receiving lookups the Staff app scans against: barcode/SKU → Product, and that Product's stock.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class ReceivingLookupEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private async Task<(HttpClient Client, string Token)> SignInAsync(AccountRole role = AccountRole.STAFF, string username = "sam")
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

    private Task<Product> SeedProductAsync(string sku, string name, string? supplierBarcode, bool isActive = true) => WithDbAsync(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = $"C-{Guid.NewGuid():N}"[..12], Name = "Group" };
        var product = new Product
        {
            Id = Guid.NewGuid(), CategoryId = category.Id, Sku = sku, Name = name, SupplierBarcode = supplierBarcode,
            IsActive = isActive, CreatedAt = now, UpdatedAt = now
        };
        db.AddRange(category, product);
        await db.SaveChangesAsync();
        return product;
    });

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> CodeOfAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<Dictionary<string, object>>())?.GetValueOrDefault("code")?.ToString();

    [Fact]
    public async Task Supplier_barcode_resolves_to_the_active_product()
    {
        var (client, token) = await SignInAsync();
        var carton = await SeedProductAsync("SKU-CARTON", "Carton Box", "8934567000011");
        await SeedProductAsync("SKU-OTHER", "Other", "8934567000099");

        var body = await ReadAsync<ResolveProductDto>(
            await client.GetWithTokenAsync("/api/warehouse/products/resolve?barcode=%208934567000011%20", token));

        Assert.Equal(carton.Id, body.ExactMatch!.Id);
        Assert.Equal(carton.Id, Assert.Single(body.Items).Id);
    }

    [Fact]
    public async Task Sku_scanned_as_barcode_resolves_too()
    {
        var (client, token) = await SignInAsync();
        var sensor = await SeedProductAsync("SKU-SENSOR", "Optical Sensor", null);

        var body = await ReadAsync<ResolveProductDto>(await client.GetWithTokenAsync("/api/warehouse/products/resolve?barcode=SKU-SENSOR", token));

        Assert.Equal(sensor.Id, body.ExactMatch!.Id);
    }

    [Fact]
    public async Task Unknown_or_inactive_barcode_is_404_product_not_found()
    {
        var (client, token) = await SignInAsync();
        await SeedProductAsync("SKU-OLD", "Retired", "8930000000001", isActive: false);

        var unknown = await client.GetWithTokenAsync("/api/warehouse/products/resolve?barcode=0000000000000", token);
        var inactive = await client.GetWithTokenAsync("/api/warehouse/products/resolve?barcode=8930000000001", token);

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("product_not_found", await CodeOfAsync(unknown));
        Assert.Equal(HttpStatusCode.NotFound, inactive.StatusCode);
    }

    [Fact]
    public async Task Keyword_search_matches_name_sku_or_barcode_in_any_case_and_skips_inactive()
    {
        var (client, token) = await SignInAsync();
        await SeedProductAsync("SKU-HEAD-1", "Wireless Headphones", "111");
        await SeedProductAsync("SKU-HEAD-2", "Headphone Stand", "222");
        await SeedProductAsync("SKU-HEAD-3", "Old Headphones", "333", isActive: false);
        await SeedProductAsync("SKU-KETTLE", "Kettle", "444");

        var body = await ReadAsync<ResolveProductDto>(await client.GetWithTokenAsync("/api/warehouse/products/resolve?query=HEADPHONE", token));

        Assert.Null(body.ExactMatch);
        Assert.Equal(["Headphone Stand", "Wireless Headphones"], body.Items.Select(i => i.Name));
    }

    [Fact]
    public async Task Resolve_without_barcode_or_query_is_400()
    {
        var (client, token) = await SignInAsync();

        var response = await client.GetWithTokenAsync("/api/warehouse/products/resolve", token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Inventory_context_shows_stock_and_containers_of_the_product()
    {
        var (client, token) = await SignInAsync();
        var product = await SeedProductAsync("SKU-BOX", "Box", "555");
        var shelf = await WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var warehouse = new WarehouseEntity { Id = Guid.NewGuid(), Code = "WH-A", Name = "A", Timezone = "Asia/Ho_Chi_Minh", IsActive = true, CreatedAt = now };
            var location = new StorageLocation { Id = Guid.NewGuid(), WarehouseId = warehouse.Id, EndpointId = Guid.NewGuid(), Code = "SHELF-1", Name = "Shelf 1", IsActive = true, CreatedAt = now };
            db.AddRange(warehouse, location);
            db.Containers.AddRange(
                new Container { Id = Guid.NewGuid(), ProductId = product.Id, Barcode = "CTN-STORED", Status = ContainerStatus.STORED, CurrentStorageLocationId = location.Id, CurrentLevelNo = 2, CreatedAt = now, UpdatedAt = now },
                new Container { Id = Guid.NewGuid(), ProductId = product.Id, Barcode = "CTN-NEW", Status = ContainerStatus.CREATED, CreatedAt = now, UpdatedAt = now });
            db.InventoryStocks.Add(new InventoryStock { Id = Guid.NewGuid(), ProductId = product.Id, StorageLocationId = location.Id, LevelNo = 2, ContainerCount = 1, UpdatedAt = now });
            await db.SaveChangesAsync();
            return location;
        });

        var body = await ReadAsync<InventoryContextDto>(
            await client.GetWithTokenAsync($"/api/warehouse/products/{product.Id}/inventory-context", token));

        Assert.Equal(2, body.TotalContainers);
        Assert.Equal(1, body.ContainersByStatus["STORED"]);
        Assert.Equal(1, body.ContainersByStatus["CREATED"]);
        var stock = Assert.Single(body.StorageLocations);
        Assert.Equal((shelf.Id, (short)2, 1), (stock.StorageLocationId, stock.LevelNo, stock.ContainerCount));
    }

    [Fact]
    public async Task Inventory_context_of_an_unknown_product_is_404()
    {
        var (client, token) = await SignInAsync();

        var response = await client.GetWithTokenAsync($"/api/warehouse/products/{Guid.NewGuid()}/inventory-context", token);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Lookups_are_open_to_staff_and_admin_but_not_to_anonymous_callers()
    {
        var product = await SeedProductAsync("SKU-X", "X", "777");
        var (admin, adminToken) = await SignInAsync(AccountRole.ADMIN, "boss");
        var anonymous = CreateAnonymousClient();

        Assert.Equal(HttpStatusCode.OK, (await admin.GetWithTokenAsync("/api/warehouse/products/resolve?barcode=777", adminToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/warehouse/products/resolve?barcode=777")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/warehouse/products/{product.Id}/inventory-context")).StatusCode);
    }
}
