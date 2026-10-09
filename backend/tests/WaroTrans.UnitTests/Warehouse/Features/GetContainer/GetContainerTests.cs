using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.GetContainer;

namespace WaroTrans.UnitTests.Warehouse.Features.GetContainer;

public class GetContainerTests
{
    [Fact]
    public async Task GetByIdAsync_returns_container_with_product_and_location_details()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(GetByIdAsync_returns_container_with_product_and_location_details));
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = Guid.NewGuid(),
            Sku = "SKU-SENS-01",
            Name = "Temperature Sensor",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        var location = new StorageLocation
        {
            Id = Guid.NewGuid(),
            WarehouseId = Guid.NewGuid(),
            EndpointId = Guid.NewGuid(),
            Code = "LOC-SHELF-A1",
            Name = "Shelf A - Level 1",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var container = new Container
        {
            Id = Guid.NewGuid(),
            ProductId = product.Id,
            Barcode = "CTN-20261006-000100",
            SupplierPackageBarcode = "SUP-PKG-01",
            Status = ContainerStatus.CREATED,
            CurrentStorageLocationId = location.Id,
            CurrentLevelNo = 1,
            CreatedBy = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Products.Add(product);
        db.StorageLocations.Add(location);
        db.Containers.Add(container);
        await db.SaveChangesAsync();

        var handler = new GetContainerHandler(db);
        var result = await handler.GetByIdAsync(container.Id);

        Assert.Equal(container.Id, result.Id);
        Assert.Equal("CTN-20261006-000100", result.Barcode);
        Assert.Equal(product.Sku, result.ProductSku);
        Assert.Equal(product.Name, result.ProductName);
        Assert.Equal(location.Code, result.CurrentStorageLocationCode);
        Assert.Equal(location.Name, result.CurrentStorageLocationName);
    }

    [Fact]
    public async Task GetByBarcodeAsync_returns_container_by_barcode()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(GetByBarcodeAsync_returns_container_by_barcode));
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = Guid.NewGuid(),
            Sku = "SKU-SENS-02",
            Name = "Humidity Sensor",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        var container = new Container
        {
            Id = Guid.NewGuid(),
            ProductId = product.Id,
            Barcode = "CTN-20261006-000200",
            Status = ContainerStatus.CREATED,
            CreatedBy = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Products.Add(product);
        db.Containers.Add(container);
        await db.SaveChangesAsync();

        var handler = new GetContainerHandler(db);
        var result = await handler.GetByBarcodeAsync("CTN-20261006-000200");

        Assert.Equal(container.Id, result.Id);
        Assert.Equal("CTN-20261006-000200", result.Barcode);
        Assert.Equal(product.Name, result.ProductName);
    }

    [Fact]
    public async Task GetByIdAsync_throws_NotFoundException_when_not_found()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(GetByIdAsync_throws_NotFoundException_when_not_found));
        var handler = new GetContainerHandler(db);

        await Assert.ThrowsAsync<NotFoundException>(() => handler.GetByIdAsync(Guid.NewGuid()));
    }
}
