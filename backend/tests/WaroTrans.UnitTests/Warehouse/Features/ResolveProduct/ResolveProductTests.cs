using FluentValidation;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.ResolveProduct;

namespace WaroTrans.UnitTests.Warehouse.Features.ResolveProduct;

public class ResolveProductTests
{
    private readonly ResolveProductValidator _validator = new();

    [Fact]
    public async Task Validator_fails_when_barcode_and_query_both_empty()
    {
        var request = new ResolveProductRequest();
        var result = await _validator.ValidateAsync(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.ErrorMessage.Contains("Either Barcode or Query must be provided"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    public async Task Validator_fails_when_limit_out_of_range(int limit)
    {
        var request = new ResolveProductRequest(Barcode: "123", Limit: limit);
        var result = await _validator.ValidateAsync(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Limit");
    }

    [Fact]
    public async Task HandleAsync_resolves_product_by_supplier_barcode()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_resolves_product_by_supplier_barcode));
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = Guid.NewGuid(),
            Sku = "SKU-TEST-001",
            SupplierBarcode = "SUP-BAR-999",
            Name = "Industrial Battery Pack",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();

        var handler = new ResolveProductHandler(db, _validator);
        var response = await handler.HandleAsync(new ResolveProductRequest(Barcode: "SUP-BAR-999"));

        Assert.NotNull(response.ExactMatch);
        Assert.Equal(product.Id, response.ExactMatch.Id);
        Assert.Equal("Industrial Battery Pack", response.ExactMatch.Name);
        Assert.Single(response.Items);
    }

    [Fact]
    public async Task HandleAsync_resolves_product_by_sku()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_resolves_product_by_sku));
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = Guid.NewGuid(),
            Sku = "SKU-ABC-123",
            SupplierBarcode = "SUP-111",
            Name = "Hydraulic Valve",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();

        var handler = new ResolveProductHandler(db, _validator);
        var response = await handler.HandleAsync(new ResolveProductRequest(Barcode: "SKU-ABC-123"));

        Assert.NotNull(response.ExactMatch);
        Assert.Equal(product.Id, response.ExactMatch.Id);
    }

    [Fact]
    public async Task HandleAsync_throws_NotFoundException_when_barcode_not_found()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_throws_NotFoundException_when_barcode_not_found));
        var handler = new ResolveProductHandler(db, _validator);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(new ResolveProductRequest(Barcode: "NON_EXISTENT")));
    }

    [Fact]
    public async Task HandleAsync_searches_products_by_name_or_sku()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_searches_products_by_name_or_sku));
        db.Products.AddRange(
            new Product
            {
                Id = Guid.NewGuid(),
                CategoryId = Guid.NewGuid(),
                Sku = "SKU-ELEC-001",
                Name = "Copper Wire Spool",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            },
            new Product
            {
                Id = Guid.NewGuid(),
                CategoryId = Guid.NewGuid(),
                Sku = "SKU-ELEC-002",
                Name = "Aluminum Wire Spool",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            },
            new Product
            {
                Id = Guid.NewGuid(),
                CategoryId = Guid.NewGuid(),
                Sku = "SKU-MECH-001",
                Name = "Steel Bolt",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            }
        );
        await db.SaveChangesAsync();

        var handler = new ResolveProductHandler(db, _validator);
        var response = await handler.HandleAsync(new ResolveProductRequest(Query: "Wire", Limit: 10));

        Assert.Null(response.ExactMatch);
        Assert.Equal(2, response.Items.Count);
        Assert.All(response.Items, item => Assert.Contains("Wire", item.Name));
    }
}
