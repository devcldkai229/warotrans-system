using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Warehouse.CreateContainer;

public sealed record CreatedContainerDto(Guid Id, Guid ProductId, string Barcode, string Status, Guid CreatedBy);

/// <summary>
/// Receiving: the endpoint was implemented but no longer mapped after the Warehouse endpoints were regrouped, so POST
/// /api/warehouse/containers answered 405 and no client could register a container for a Transport Request.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class CreateContainerEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private const string Containers = "/api/warehouse/containers";

    private async Task<Guid> SeedProductAsync(bool isActive = true)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = "PKG", Name = "Packaging" };
        var now = DateTimeOffset.UtcNow;
        var product = new Product
        {
            Id = Guid.NewGuid(), CategoryId = category.Id, Sku = "SKU-CTN", Name = "Box",
            IsActive = isActive, CreatedAt = now, UpdatedAt = now
        };
        db.ProductCategories.Add(category);
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product.Id;
    }

    [Fact]
    public async Task Post_container_persists_created_container()
    {
        var account = await Factory.CreateAccountAsync("receiver", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("receiver")).AccessToken;
        var productId = await SeedProductAsync();

        var response = await client.SendWithTokenAsync(HttpMethod.Post, Containers, token, new { productId });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<CreatedContainerDto>())!;
        Assert.Equal(productId, created.ProductId);
        Assert.Equal("CREATED", created.Status);
        Assert.StartsWith("CTN-", created.Barcode);
        Assert.Equal(account.Id, created.CreatedBy);

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var stored = await db.Containers.AsNoTracking().SingleAsync(c => c.Id == created.Id);
        Assert.Equal(created.Barcode, stored.Barcode);
    }

    [Fact]
    public async Task Post_container_for_an_inactive_product_is_not_found()
    {
        await Factory.CreateAccountAsync("receiver2", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("receiver2")).AccessToken;
        var productId = await SeedProductAsync(isActive: false);

        var response = await client.SendWithTokenAsync(HttpMethod.Post, Containers, token, new { productId });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Post_container_requires_a_signed_in_user()
    {
        var response = await CreateAnonymousClient().PostAsJsonAsync(Containers, new { productId = Guid.NewGuid() });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
