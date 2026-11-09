using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WarehouseEntity = WaroTrans.Warehouse.Entities.Warehouse;

namespace WaroTrans.IntegrationTests.Warehouse.StockVouchers;

public sealed record VoucherLineDto(Guid Id, int LineNo, Guid ContainerId, string ContainerBarcode, string ContainerStatus, bool Done);

public sealed record VoucherDto(
    Guid Id,
    string Code,
    string Type,
    string Status,
    int ContainerCount,
    int DoneCount,
    IReadOnlyList<VoucherLineDto> Lines);

public sealed record VoucherListDto(IReadOnlyList<VoucherDto> Items, int Total);

public sealed record CreatedContainerDto(Guid Id, string Barcode);

[Collection(IntegrationCollection.Name)]
public sealed class StockVoucherEndpointTests(WaroTransWebApplicationFactory factory)
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

    private async Task DeliverAsync(Guid containerId, Guid? shelfId, short? level)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IContainerMovementRecorder>()
            .RecordDeliveredAsync(new ContainerDelivery(containerId, shelfId, level));
    }

    private Task<(WarehouseEntity Warehouse, Product Product, StorageLocation Shelf)> SeedAsync() => WithDbAsync(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var warehouse = new WarehouseEntity { Id = Guid.NewGuid(), Code = "WH-A", Name = "Main", Timezone = "Asia/Ho_Chi_Minh", IsActive = true, CreatedAt = now };
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = "CAT-BOX", Name = "Boxes" };
        var product = new Product { Id = Guid.NewGuid(), CategoryId = category.Id, Sku = "SKU-BOX", Name = "Carton", IsActive = true, CreatedAt = now, UpdatedAt = now };
        var shelf = new StorageLocation { Id = Guid.NewGuid(), WarehouseId = warehouse.Id, EndpointId = Guid.NewGuid(), Code = "SHELF-1", Name = "Shelf 1", IsActive = true, CreatedAt = now };
        db.AddRange(warehouse, category, product, shelf);
        await db.SaveChangesAsync();
        return (warehouse, product, shelf);
    });

    private Task<Guid> SeedStoredContainerAsync(Product product, StorageLocation shelf) => WithDbAsync(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var container = new Container
        {
            Id = Guid.NewGuid(), ProductId = product.Id, Barcode = $"CTN-{Guid.NewGuid():N}"[..20], Status = ContainerStatus.STORED,
            CurrentStorageLocationId = shelf.Id, CurrentLevelNo = 1, CreatedBy = Guid.NewGuid(), CreatedAt = now, UpdatedAt = now
        };
        db.Containers.Add(container);
        var stock = await db.InventoryStocks.FirstOrDefaultAsync(s => s.ProductId == product.Id && s.StorageLocationId == shelf.Id && s.LevelNo == 1);
        if (stock is null)
        {
            db.InventoryStocks.Add(new InventoryStock { Id = Guid.NewGuid(), ProductId = product.Id, StorageLocationId = shelf.Id, LevelNo = 1, ContainerCount = 1, UpdatedAt = now });
        }
        else
        {
            stock.ContainerCount++;
        }

        await db.SaveChangesAsync();
        return container.Id;
    });

    private Task<int> StockAsync(Guid productId, Guid shelfId) => WithDbAsync(db =>
        db.InventoryStocks.Where(s => s.ProductId == productId && s.StorageLocationId == shelfId && s.LevelNo == 1)
            .Select(s => s.ContainerCount).FirstOrDefaultAsync());

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        Assert.True(expected == response.StatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    [Fact]
    public async Task Outbound_voucher_issues_its_containers_on_delivery_and_takes_them_off_stock()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, product, shelf) = await SeedAsync();
        var older = await SeedStoredContainerAsync(product, shelf);
        await SeedStoredContainerAsync(product, shelf);

        var voucher = await ReadAsync<VoucherDto>(
            await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/stock-vouchers", token,
                new { warehouseId = warehouse.Id, type = "OUTBOUND", referenceNo = "SO-9" }),
            HttpStatusCode.Created);
        Assert.StartsWith("PX-", voucher.Code);

        var picked = await ReadAsync<VoucherDto>(await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/warehouse/stock-vouchers/{voucher.Id}/lines", token, new { productId = product.Id, count = 1 }));
        Assert.Equal(older, Assert.Single(picked.Lines).ContainerId);

        var confirmed = await ReadAsync<VoucherDto>(await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/warehouse/stock-vouchers/{voucher.Id}/confirm", token));
        Assert.Equal("CONFIRMED", confirmed.Status);
        Assert.Equal(0, confirmed.DoneCount);

        await DeliverAsync(older, null, null);
        await DeliverAsync(older, null, null);

        var after = await ReadAsync<VoucherDto>(await client.GetWithTokenAsync($"/api/warehouse/stock-vouchers/{voucher.Id}", token));
        Assert.Equal("CONFIRMED", after.Status);
        Assert.Equal(1, after.DoneCount);
        Assert.Equal("ISSUED", after.Lines[0].ContainerStatus);
        Assert.Equal(1, await StockAsync(product.Id, shelf.Id));

        var list = await ReadAsync<VoucherListDto>(await client.GetWithTokenAsync(
            $"/api/warehouse/stock-vouchers?warehouseId={warehouse.Id}&type=OUTBOUND", token));
        Assert.Equal(1, Assert.Single(list.Items).DoneCount);
    }

    [Fact]
    public async Task Inbound_container_received_on_a_voucher_counts_once_it_reaches_a_shelf()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, product, shelf) = await SeedAsync();
        var voucher = await ReadAsync<VoucherDto>(
            await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/stock-vouchers", token,
                new { warehouseId = warehouse.Id, type = "INBOUND" }),
            HttpStatusCode.Created);

        var container = await ReadAsync<CreatedContainerDto>(
            await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/containers", token,
                new { productId = product.Id, stockVoucherId = voucher.Id }),
            HttpStatusCode.Created);
        await ReadAsync<VoucherDto>(await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/warehouse/stock-vouchers/{voucher.Id}/confirm", token));

        await DeliverAsync(container.Id, shelf.Id, 1);

        var after = await ReadAsync<VoucherDto>(await client.GetWithTokenAsync($"/api/warehouse/stock-vouchers/{voucher.Id}", token));
        Assert.Equal(1, after.ContainerCount);
        Assert.Equal(1, after.DoneCount);
        Assert.Equal("STORED", after.Lines[0].ContainerStatus);
        Assert.Equal(1, await StockAsync(product.Id, shelf.Id));
    }

    [Fact]
    public async Task Confirmed_voucher_cannot_be_cancelled_or_changed()
    {
        var (client, token) = await SignInAsync();
        var (warehouse, product, shelf) = await SeedAsync();
        var containerId = await SeedStoredContainerAsync(product, shelf);
        var voucher = await ReadAsync<VoucherDto>(
            await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/stock-vouchers", token,
                new { warehouseId = warehouse.Id, type = "OUTBOUND" }),
            HttpStatusCode.Created);
        var withLine = await ReadAsync<VoucherDto>(await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/warehouse/stock-vouchers/{voucher.Id}/lines", token, new { containerIds = new[] { containerId } }));
        await ReadAsync<VoucherDto>(await client.SendWithTokenAsync(HttpMethod.Post, $"/api/warehouse/stock-vouchers/{voucher.Id}/confirm", token));

        var cancel = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/warehouse/stock-vouchers/{voucher.Id}/cancel", token);
        var remove = await client.SendWithTokenAsync(HttpMethod.Delete, $"/api/warehouse/stock-vouchers/{voucher.Id}/lines/{withLine.Lines[0].Id}", token);

        Assert.Equal(HttpStatusCode.BadRequest, cancel.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, remove.StatusCode);
    }

    [Fact]
    public async Task A_technician_may_not_open_a_voucher()
    {
        var (warehouse, _, _) = await SeedAsync();
        var (client, token) = await SignInAsync(AccountRole.TECHNICIAN, "tess");

        var response = await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/stock-vouchers", token,
            new { warehouseId = warehouse.Id, type = "INBOUND" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Vouchers_are_closed_to_anonymous_callers()
    {
        var (warehouse, _, _) = await SeedAsync();

        var response = await CreateAnonymousClient().GetAsync($"/api/warehouse/stock-vouchers?warehouseId={warehouse.Id}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
