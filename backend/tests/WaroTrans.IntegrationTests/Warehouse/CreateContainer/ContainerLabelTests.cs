using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Warehouse.CreateContainer;

/// <summary>
/// Pre-printed labels: codes are issued from the container sequence without creating containers; scanning one with a
/// product creates exactly that container, once. A second scan of the same label and a code never issued are refused.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class ContainerLabelTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private async Task<(Guid WarehouseId, Guid ProductId)> SeedAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var now = DateTimeOffset.UtcNow;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var warehouse = new WaroTrans.Warehouse.Entities.Warehouse { Id = Guid.NewGuid(), Code = $"WH-{suffix}", Name = $"Warehouse {suffix}", Timezone = "Asia/Ho_Chi_Minh", IsActive = true, CreatedAt = now };
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = $"CAT-{suffix}", Name = "Labels" };
        var product = new Product { Id = Guid.NewGuid(), CategoryId = category.Id, Sku = $"SKU-{suffix}", Name = "Labelled box", IsActive = true, CreatedAt = now, UpdatedAt = now };
        db.Warehouses.Add(warehouse);
        db.ProductCategories.Add(category);
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return (warehouse.Id, product.Id);
    }

    private static object Claim(Guid warehouseId, Guid productId, string label) => new
    {
        warehouseId, requestId = Guid.NewGuid(), containerCount = 1, labelBarcode = label,
        groups = new[] { new { groupKey = "g1", productId, containerCount = 1, quantityPerContainer = 1, unit = "container" } },
    };

    private static async Task<string?> CodeOf(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    [Fact]
    public async Task Issued_label_becomes_one_container_and_cannot_be_used_twice()
    {
        await Factory.CreateAccountAsync("labeller", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("labeller")).AccessToken;
        var (warehouseId, productId) = await SeedAsync();

        var issued = await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/container-labels", token, new { count = 2 });
        Assert.Equal(HttpStatusCode.OK, issued.StatusCode);
        var codes = (await issued.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("codes").EnumerateArray().Select(c => c.GetString()!).ToArray();
        Assert.Equal(2, codes.Length);
        Assert.All(codes, code => Assert.Matches(@"^C\d{9}$", code));

        var claimed = await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/containers", token, Claim(warehouseId, productId, codes[0]));
        Assert.Equal(HttpStatusCode.OK, claimed.StatusCode);
        var item = (await claimed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items")[0];
        Assert.Equal(codes[0], item.GetProperty("barcode").GetString());
        Assert.Equal(productId, item.GetProperty("productId").GetGuid());

        var again = await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/containers", token, Claim(warehouseId, productId, codes[0]));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("label_already_used", await CodeOf(again));

        // The next number of the day has not been issued yet.
        var notIssued = $"{codes[1][..7]}{(int.Parse(codes[1][7..]) + 500):000}";
        var refused = await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/containers", token, Claim(warehouseId, productId, notIssued));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("label_not_issued", await CodeOf(refused));
    }

    [Fact]
    public async Task Label_count_is_bounded_and_needs_container_create()
    {
        await Factory.CreateAccountAsync("labeller2", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("labeller2")).AccessToken;
        var tooMany = await client.SendWithTokenAsync(HttpMethod.Post, "/api/warehouse/container-labels", token, new { count = 201 });
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
        Assert.Equal("label_count_invalid", await CodeOf(tooMany));
    }
}
