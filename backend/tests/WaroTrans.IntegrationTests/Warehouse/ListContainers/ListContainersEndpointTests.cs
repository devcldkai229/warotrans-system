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

namespace WaroTrans.IntegrationTests.Warehouse.ListContainers;

public sealed record ContainerItemDto(
    Guid Id,
    string Barcode,
    string Status,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    Guid? CurrentStorageLocationId,
    string? CurrentStorageLocationCode,
    Guid? CurrentEndpointId,
    short? CurrentLevelNo,
    string? SupplierPackageBarcode,
    DateTimeOffset UpdatedAt);

public sealed record ListContainersDto(IReadOnlyList<ContainerItemDto> Items, int Total);

[Collection(IntegrationCollection.Name)]
public sealed class ListContainersEndpointTests(WaroTransWebApplicationFactory factory)
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

    private Task<Product> SeedProductAsync(string sku = "SKU-1", string name = "Carton", string? barcode = "8935") => WithDbAsync(async db =>
    {
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = $"C-{Guid.NewGuid():N}"[..12], Name = "Group" };
        var now = DateTimeOffset.UtcNow;
        var product = new Product
        {
            Id = Guid.NewGuid(), CategoryId = category.Id, Sku = sku, Name = name, SupplierBarcode = barcode,
            IsActive = true, CreatedAt = now, UpdatedAt = now
        };
        db.ProductCategories.Add(category);
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product;
    });

    private Task<StorageLocation> SeedLocationAsync(Guid warehouseId, string code) => WithDbAsync(async db =>
    {
        var location = new StorageLocation
        {
            Id = Guid.NewGuid(), WarehouseId = warehouseId, EndpointId = Guid.NewGuid(), Code = code, Name = code,
            IsActive = true, CreatedAt = DateTimeOffset.UtcNow
        };
        db.StorageLocations.Add(location);
        await db.SaveChangesAsync();
        return location;
    });

    private Task<Container> SeedContainerAsync(
        Product product,
        string barcode,
        ContainerStatus status,
        Guid? locationId = null,
        short? level = null,
        string? supplierPackageBarcode = null) => WithDbAsync(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var container = new Container
        {
            Id = Guid.NewGuid(), ProductId = product.Id, Barcode = barcode, SupplierPackageBarcode = supplierPackageBarcode,
            Status = status, CurrentStorageLocationId = locationId, CurrentLevelNo = level,
            CreatedBy = Guid.NewGuid(), CreatedAt = now, UpdatedAt = now
        };
        db.Containers.Add(container);
        await db.SaveChangesAsync();
        return container;
    });

    private static string Url(Guid warehouseId, string query = "") => $"/api/warehouse/containers?warehouseId={warehouseId}{query}";

    private static async Task<ListContainersDto> ReadAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ListContainersDto>())!;
    }

    [Fact]
    public async Task List_with_eligible_only_false_returns_every_status_with_barcode_and_updated_at()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var product = await SeedProductAsync();
        await SeedContainerAsync(product, "CTN-2", ContainerStatus.IN_TRANSIT, supplierPackageBarcode: "8935");
        await SeedContainerAsync(product, "CTN-1", ContainerStatus.OUT_OF_SERVICE);
        await SeedContainerAsync(product, "CTN-3", ContainerStatus.CREATED);

        var body = await ReadAsync(await client.GetWithTokenAsync(Url(warehouse.Id, "&eligibleOnly=false"), token));

        Assert.Equal(["CTN-1", "CTN-2", "CTN-3"], body.Items.Select(c => c.Barcode));
        Assert.Equal(3, body.Total);
        var transit = body.Items.Single(c => c.Barcode == "CTN-2");
        Assert.Equal("IN_TRANSIT", transit.Status);
        Assert.Equal("8935", transit.SupplierPackageBarcode);
        Assert.Equal("SKU-1", transit.ProductSku);
        Assert.Equal("Carton", transit.ProductName);
        Assert.True(transit.UpdatedAt > DateTimeOffset.UtcNow.AddMinutes(-5));
    }

    [Fact]
    public async Task List_by_default_returns_only_containers_that_can_be_moved()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var product = await SeedProductAsync();
        await SeedContainerAsync(product, "CTN-CREATED", ContainerStatus.CREATED);
        await SeedContainerAsync(product, "CTN-PACKED", ContainerStatus.PACKED);
        await SeedContainerAsync(product, "CTN-RESERVED", ContainerStatus.RESERVED);
        await SeedContainerAsync(product, "CTN-HOLD", ContainerStatus.HOLD);

        var body = await ReadAsync(await client.GetWithTokenAsync(Url(warehouse.Id), token));

        Assert.Equal(["CTN-CREATED", "CTN-PACKED"], body.Items.Select(c => c.Barcode));
    }

    [Fact]
    public async Task List_is_scoped_to_the_warehouse_of_the_storage_location_and_includes_unlocated_containers()
    {
        var (client, token) = await SignInAsync();
        var warehouseA = await SeedWarehouseAsync("WH-A");
        var warehouseB = await SeedWarehouseAsync("WH-B");
        var shelfA = await SeedLocationAsync(warehouseA.Id, "SHELF-A");
        var shelfB = await SeedLocationAsync(warehouseB.Id, "SHELF-B");
        var product = await SeedProductAsync();
        await SeedContainerAsync(product, "CTN-IN-A", ContainerStatus.STORED, shelfA.Id, 2);
        await SeedContainerAsync(product, "CTN-IN-B", ContainerStatus.STORED, shelfB.Id, 1);
        await SeedContainerAsync(product, "CTN-NOWHERE", ContainerStatus.CREATED);

        var inA = await ReadAsync(await client.GetWithTokenAsync(Url(warehouseA.Id, "&eligibleOnly=false"), token));

        Assert.Equal(["CTN-IN-A", "CTN-NOWHERE"], inA.Items.Select(c => c.Barcode));
        var stored = inA.Items.Single(c => c.Barcode == "CTN-IN-A");
        Assert.Equal("SHELF-A", stored.CurrentStorageLocationCode);
        Assert.Equal((short)2, stored.CurrentLevelNo);
        Assert.Equal(shelfA.EndpointId, stored.CurrentEndpointId);
    }

    [Fact]
    public async Task List_searches_barcode_sku_product_name_and_supplier_package_barcode()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var carton = await SeedProductAsync("SKU-CARTON", "Carton Box", "111");
        var sensor = await SeedProductAsync("SKU-SENSOR", "Optical Sensor", "222");
        await SeedContainerAsync(carton, "CTN-100", ContainerStatus.CREATED, supplierPackageBarcode: "777");
        await SeedContainerAsync(sensor, "CTN-200", ContainerStatus.CREATED);

        async Task<string[]> Find(string term) =>
            (await ReadAsync(await client.GetWithTokenAsync(Url(warehouse.Id, $"&search={term}"), token)))
            .Items.Select(c => c.Barcode).ToArray();

        Assert.Equal(["CTN-200"], await Find("ctn-200"));
        Assert.Equal(["CTN-100"], await Find("sku-carton"));
        Assert.Equal(["CTN-200"], await Find("optical"));
        Assert.Equal(["CTN-100"], await Find("777"));
        Assert.Empty(await Find("nothing"));
    }

    [Fact]
    public async Task List_take_limits_the_page_but_the_total_counts_everything()
    {
        var (client, token) = await SignInAsync();
        var warehouse = await SeedWarehouseAsync("WH-A");
        var product = await SeedProductAsync();
        foreach (var barcode in new[] { "CTN-1", "CTN-2", "CTN-3" })
        {
            await SeedContainerAsync(product, barcode, ContainerStatus.CREATED);
        }

        var body = await ReadAsync(await client.GetWithTokenAsync(Url(warehouse.Id, "&take=2"), token));

        Assert.Equal(["CTN-1", "CTN-2"], body.Items.Select(c => c.Barcode));
        Assert.Equal(3, body.Total);
    }

    [Theory]
    [InlineData("&take=0")]
    [InlineData("&take=501")]
    public async Task List_with_a_bad_take_returns_400(string query)
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

        var response = await client.GetWithTokenAsync("/api/warehouse/containers", token);

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
