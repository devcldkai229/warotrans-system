using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Warehouse.ProductCatalog;

public sealed record ProductDto(
    Guid Id,
    Guid CategoryId,
    string Sku,
    string? SupplierBarcode,
    string Name,
    string? Description,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record ListProductsDto(IReadOnlyList<ProductDto> Items, int Total);

public sealed record CategoryDto(Guid Id, string Code, string Name, string? Description);

public sealed record ListCategoriesDto(IReadOnlyList<CategoryDto> Items, int Total);

/// <summary>
/// Product master catalog: products and their categories. Tokens come from the real login endpoint, so the
/// AdminOnly policy on writes and the authenticated-user fallback on reads are both exercised.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class ProductCatalogEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private const string Products = "/api/warehouse/products";
    private const string Categories = "/api/warehouse/product-categories";

    private async Task<(HttpClient Client, string Token)> SignInAsync(AccountRole role, string username)
    {
        await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        return (client, (await client.LoginAsync(username)).AccessToken);
    }

    private async Task<ProductCategory> SeedCategoryAsync(string code = "PKG", string name = "Packaging")
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = code, Name = name };
        db.ProductCategories.Add(category);
        await db.SaveChangesAsync();
        return category;
    }

    private async Task<Product> SeedProductAsync(
        Guid categoryId,
        string sku,
        string name = "Item",
        string? barcode = null,
        bool isActive = true)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var now = DateTimeOffset.UtcNow;
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = categoryId,
            Sku = sku,
            Name = name,
            SupplierBarcode = barcode,
            IsActive = isActive,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product;
    }

    private static object NewProduct(Guid categoryId, string sku = "SKU-1", string name = "Box", string? barcode = null) =>
        new { categoryId, sku, name, supplierBarcode = barcode, description = (string?)null };

    /* -------------------------------------------------------------------------------------- categories */

    [Fact]
    public async Task Create_category_stores_an_upper_case_code_and_staff_can_list_it()
    {
        var (admin, adminToken) = await SignInAsync(AccountRole.ADMIN, "boss");
        var (staff, staffToken) = await SignInAsync(AccountRole.STAFF, "sam");

        var created = await admin.SendWithTokenAsync(
            HttpMethod.Post, Categories, adminToken, new { code = "  elec ", name = " Electronics ", description = "Boards" });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var category = (await created.Content.ReadFromJsonAsync<CategoryDto>())!;
        Assert.Equal("ELEC", category.Code);
        Assert.Equal("Electronics", category.Name);

        var list = await staff.GetWithTokenAsync(Categories, staffToken);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var body = (await list.Content.ReadFromJsonAsync<ListCategoriesDto>())!;
        Assert.Equal(["ELEC"], body.Items.Select(c => c.Code));
        Assert.Equal(1, body.Total);
    }

    [Fact]
    public async Task Create_category_with_a_taken_code_in_any_letter_case_returns_409()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        await SeedCategoryAsync("PKG");

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, Categories, token, new { code = "pkg", name = "Other" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("product_category_code_taken", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Create_category_as_staff_returns_403_and_without_a_token_401()
    {
        var (staff, token) = await SignInAsync(AccountRole.STAFF, "sam");

        var asStaff = await staff.SendWithTokenAsync(HttpMethod.Post, Categories, token, new { code = "X", name = "X" });
        var anonymous = await CreateAnonymousClient().PostAsJsonAsync(Categories, new { code = "X", name = "X" });

        Assert.Equal(HttpStatusCode.Forbidden, asStaff.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    [Theory]
    [InlineData("", "Name")]
    [InlineData("CODE", "")]
    public async Task Create_category_with_missing_fields_returns_400(string code, string name)
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, Categories, token, new { code, name });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /* --------------------------------------------------------------------------------------- products */

    [Fact]
    public async Task Create_product_trims_and_upper_cases_the_sku_and_starts_active()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var category = await SeedCategoryAsync();

        var response = await admin.SendWithTokenAsync(
            HttpMethod.Post, Products, token,
            new { categoryId = category.Id, sku = "  sku-77 ", name = " Carton ", supplierBarcode = " 893500 ", description = "  Strong  " });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var product = (await response.Content.ReadFromJsonAsync<ProductDto>())!;
        Assert.Equal("SKU-77", product.Sku);
        Assert.Equal("Carton", product.Name);
        Assert.Equal("893500", product.SupplierBarcode);
        Assert.Equal("Strong", product.Description);
        Assert.True(product.IsActive);
        Assert.Equal(category.Id, product.CategoryId);
    }

    [Fact]
    public async Task Create_product_with_a_blank_barcode_stores_none_and_several_may_do_so()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var category = await SeedCategoryAsync();

        var first = await admin.SendWithTokenAsync(HttpMethod.Post, Products, token, NewProduct(category.Id, "A-1", barcode: "   "));
        var second = await admin.SendWithTokenAsync(HttpMethod.Post, Products, token, NewProduct(category.Id, "A-2", barcode: ""));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        Assert.Null((await first.Content.ReadFromJsonAsync<ProductDto>())!.SupplierBarcode);
    }

    [Fact]
    public async Task Create_product_with_a_taken_sku_in_any_letter_case_returns_409()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var category = await SeedCategoryAsync();
        await SeedProductAsync(category.Id, "SKU-1");

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, Products, token, NewProduct(category.Id, "sku-1"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("product_sku_taken", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Create_product_with_a_taken_supplier_barcode_returns_409()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var category = await SeedCategoryAsync();
        await SeedProductAsync(category.Id, "SKU-1", barcode: "8935");

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, Products, token, NewProduct(category.Id, "SKU-2", barcode: "8935"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("product_supplier_barcode_taken", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Create_product_in_an_unknown_category_returns_404()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, Products, token, NewProduct(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("product_category_not_found", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Create_product_as_staff_returns_403_and_without_a_token_401()
    {
        var (staff, token) = await SignInAsync(AccountRole.STAFF, "sam");
        var category = await SeedCategoryAsync();

        var asStaff = await staff.SendWithTokenAsync(HttpMethod.Post, Products, token, NewProduct(category.Id));
        var anonymous = await CreateAnonymousClient().PostAsJsonAsync(Products, NewProduct(category.Id));

        Assert.Equal(HttpStatusCode.Forbidden, asStaff.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    [Theory]
    [InlineData("", "Name", 0)]
    [InlineData("SKU", "", 0)]
    [InlineData("SKU", "x", 201)] // the name is stretched to 201 characters below; the limit is 200
    public async Task Create_product_with_invalid_input_returns_400(string sku, string name, int nameLength)
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var category = await SeedCategoryAsync();
        var finalName = nameLength > 0 ? new string('n', nameLength) : name;

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, Products, token, NewProduct(category.Id, sku, finalName));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_product_with_an_empty_category_id_returns_400()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, Products, token, NewProduct(Guid.Empty));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /* ------------------------------------------------------------------------------------------- list */

    [Fact]
    public async Task List_products_is_ordered_by_sku_and_open_to_staff()
    {
        var (staff, token) = await SignInAsync(AccountRole.STAFF, "sam");
        var category = await SeedCategoryAsync();
        await SeedProductAsync(category.Id, "SKU-B");
        await SeedProductAsync(category.Id, "SKU-A");

        var response = await staff.GetWithTokenAsync(Products, token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<ListProductsDto>())!;
        Assert.Equal(["SKU-A", "SKU-B"], body.Items.Select(p => p.Sku));
        Assert.Equal(2, body.Total);
    }

    [Fact]
    public async Task List_products_filters_by_category_active_flag_and_search_text()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var packaging = await SeedCategoryAsync("PKG");
        var electronics = await SeedCategoryAsync("ELEC", "Electronics");
        await SeedProductAsync(packaging.Id, "SKU-1", "Carton Box", "111");
        await SeedProductAsync(packaging.Id, "SKU-2", "Pallet Wrap", "222", isActive: false);
        await SeedProductAsync(electronics.Id, "SKU-3", "Optical Sensor", "333");

        async Task<string[]> Skus(string query)
        {
            var response = await admin.GetWithTokenAsync($"{Products}{query}", token);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<ListProductsDto>())!.Items.Select(p => p.Sku).ToArray();
        }

        Assert.Equal(["SKU-1", "SKU-2"], await Skus($"?categoryId={packaging.Id}"));
        Assert.Equal(["SKU-1", "SKU-3"], await Skus("?isActive=true"));
        Assert.Equal(["SKU-2"], await Skus("?isActive=false"));
        Assert.Equal(["SKU-3"], await Skus("?search=OPTICAL")); // name, any letter case
        Assert.Equal(["SKU-2"], await Skus("?search=222")); // supplier barcode
        Assert.Equal(["SKU-1"], await Skus("?search=sku-1")); // sku
        Assert.Empty(await Skus("?search=nothing"));
    }

    [Fact]
    public async Task List_products_pages_and_reports_the_total()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var category = await SeedCategoryAsync();
        foreach (var sku in new[] { "S1", "S2", "S3" })
        {
            await SeedProductAsync(category.Id, sku);
        }

        var response = await admin.GetWithTokenAsync($"{Products}?skip=1&take=1", token);

        var body = (await response.Content.ReadFromJsonAsync<ListProductsDto>())!;
        Assert.Equal(["S2"], body.Items.Select(p => p.Sku));
        Assert.Equal(3, body.Total);
    }

    [Theory]
    [InlineData("?take=0")]
    [InlineData("?take=501")]
    [InlineData("?skip=-1")]
    public async Task List_products_with_a_bad_page_returns_400(string query)
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");

        var response = await admin.GetWithTokenAsync($"{Products}{query}", token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task List_products_without_a_token_returns_401()
    {
        var response = await CreateAnonymousClient().GetAsync(Products);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /* ----------------------------------------------------------------------------------------- status */

    [Fact]
    public async Task Deactivate_and_reactivate_a_product()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var category = await SeedCategoryAsync();
        var product = await SeedProductAsync(category.Id, "SKU-1");

        var off = await admin.SendWithTokenAsync(HttpMethod.Post, $"{Products}/{product.Id}/status", token, new { isActive = false });

        Assert.Equal(HttpStatusCode.OK, off.StatusCode);
        var inactive = (await off.Content.ReadFromJsonAsync<ProductDto>())!;
        Assert.False(inactive.IsActive);
        Assert.True(inactive.UpdatedAt >= product.UpdatedAt);

        var inactiveList = await admin.GetWithTokenAsync($"{Products}?isActive=false", token);
        Assert.Equal(["SKU-1"], (await inactiveList.Content.ReadFromJsonAsync<ListProductsDto>())!.Items.Select(p => p.Sku));

        var on = await admin.SendWithTokenAsync(HttpMethod.Post, $"{Products}/{product.Id}/status", token, new { isActive = true });
        Assert.True((await on.Content.ReadFromJsonAsync<ProductDto>())!.IsActive);
    }

    [Fact]
    public async Task Setting_the_status_a_product_already_has_is_accepted_without_touching_it()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");
        var category = await SeedCategoryAsync();
        var product = await SeedProductAsync(category.Id, "SKU-1");

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, $"{Products}/{product.Id}/status", token, new { isActive = true });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<ProductDto>())!;
        Assert.Equal(product.UpdatedAt.ToUnixTimeMilliseconds(), body.UpdatedAt.ToUnixTimeMilliseconds());
    }

    [Fact]
    public async Task Status_of_an_unknown_product_returns_404()
    {
        var (admin, token) = await SignInAsync(AccountRole.ADMIN, "boss");

        var response = await admin.SendWithTokenAsync(HttpMethod.Post, $"{Products}/{Guid.NewGuid()}/status", token, new { isActive = false });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("product_not_found", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Status_as_staff_returns_403()
    {
        var (staff, token) = await SignInAsync(AccountRole.STAFF, "sam");
        var category = await SeedCategoryAsync();
        var product = await SeedProductAsync(category.Id, "SKU-1");

        var response = await staff.SendWithTokenAsync(HttpMethod.Post, $"{Products}/{product.Id}/status", token, new { isActive = false });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
