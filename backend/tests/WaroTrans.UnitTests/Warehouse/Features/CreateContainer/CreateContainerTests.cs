using FluentValidation;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.CreateContainer;

namespace WaroTrans.UnitTests.Warehouse.Features.CreateContainer;

public class CreateContainerTests
{
    private readonly CreateContainerValidator _validator = new();

    [Fact]
    public async Task Validator_fails_when_product_id_is_empty()
    {
        var request = new CreateContainerRequest(Guid.Empty);
        var result = await _validator.ValidateAsync(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateContainerRequest.ProductId));
    }

    [Fact]
    public async Task Validator_fails_when_initial_level_no_is_zero_or_negative()
    {
        var request = new CreateContainerRequest(Guid.NewGuid(), InitialLevelNo: 0);
        var result = await _validator.ValidateAsync(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateContainerRequest.InitialLevelNo));
    }

    [Fact]
    public async Task HandleAsync_creates_container_with_generated_barcode_and_created_status()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_creates_container_with_generated_barcode_and_created_status));
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = Guid.NewGuid(),
            Sku = "SKU-BOX-01",
            SupplierBarcode = "SUP-PKG-100",
            Name = "Plastic Bin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();

        var fakeCodeGenerator = new FakeBusinessCodeGenerator("CTN-20261006-000042");
        var userId = Guid.NewGuid();
        var fakeCurrentUser = new FakeCurrentUser(userId);
        var handler = new CreateContainerHandler(
            db,
            fakeCodeGenerator,
            fakeCurrentUser,
            _validator,
            NullLogger<CreateContainerHandler>.Instance);

        var request = new CreateContainerRequest(
            ProductId: product.Id,
            SupplierPackageBarcode: "SUP-PKG-100");

        var response = await handler.HandleAsync(request);

        Assert.NotEqual(Guid.Empty, response.Id);
        Assert.Equal(product.Id, response.ProductId);
        Assert.Equal("CTN-20261006-000042", response.Barcode);
        Assert.Equal("SUP-PKG-100", response.SupplierPackageBarcode);
        Assert.Equal(ContainerStatus.CREATED.ToString(), response.Status);
        Assert.Equal(userId, response.CreatedBy);

        var saved = await db.Containers.FindAsync(response.Id);
        Assert.NotNull(saved);
        Assert.Equal(ContainerStatus.CREATED, saved.Status);
        Assert.Equal("CTN-20261006-000042", saved.Barcode);
    }

    [Fact]
    public async Task HandleAsync_throws_NotFoundException_when_product_inactive_or_missing()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_throws_NotFoundException_when_product_inactive_or_missing));
        var handler = new CreateContainerHandler(
            db,
            new FakeBusinessCodeGenerator(),
            new FakeCurrentUser(),
            _validator,
            NullLogger<CreateContainerHandler>.Instance);

        var request = new CreateContainerRequest(Guid.NewGuid());

        await Assert.ThrowsAsync<NotFoundException>(() => handler.HandleAsync(request));
    }

    [Fact]
    public async Task HandleAsync_throws_NotFoundException_when_initial_storage_location_invalid()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_throws_NotFoundException_when_initial_storage_location_invalid));
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = Guid.NewGuid(),
            Sku = "SKU-TEST-002",
            Name = "Motor",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();

        var handler = new CreateContainerHandler(
            db,
            new FakeBusinessCodeGenerator(),
            new FakeCurrentUser(),
            _validator,
            NullLogger<CreateContainerHandler>.Instance);

        var request = new CreateContainerRequest(
            ProductId: product.Id,
            InitialStorageLocationId: Guid.NewGuid());

        await Assert.ThrowsAsync<NotFoundException>(() => handler.HandleAsync(request));
    }
}
