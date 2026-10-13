using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.GetProductInventoryContext;

namespace WaroTrans.UnitTests.Warehouse.Features.GetProductInventoryContext;

public class GetProductInventoryContextTests
{
    [Fact]
    public async Task HandleAsync_returns_inventory_and_storage_context_for_product()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_returns_inventory_and_storage_context_for_product));
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = Guid.NewGuid(),
            Sku = "SKU-VALVE-01",
            Name = "Pressure Valve",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        var locationA = new StorageLocation
        {
            Id = Guid.NewGuid(),
            WarehouseId = Guid.NewGuid(),
            EndpointId = Guid.NewGuid(),
            Code = "LOC-A1",
            Name = "Aisle 1",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var locationB = new StorageLocation
        {
            Id = Guid.NewGuid(),
            WarehouseId = Guid.NewGuid(),
            EndpointId = Guid.NewGuid(),
            Code = "LOC-B1",
            Name = "Aisle 2",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        db.Products.Add(product);
        db.StorageLocations.AddRange(locationA, locationB);

        // Add 2 containers: 1 CREATED, 1 STORED
        db.Containers.AddRange(
            new Container
            {
                Id = Guid.NewGuid(),
                ProductId = product.Id,
                Barcode = "CTN-20261006-000001",
                Status = ContainerStatus.CREATED,
                CreatedBy = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            },
            new Container
            {
                Id = Guid.NewGuid(),
                ProductId = product.Id,
                Barcode = "CTN-20261006-000002",
                Status = ContainerStatus.STORED,
                CurrentStorageLocationId = locationA.Id,
                CurrentLevelNo = 1,
                CreatedBy = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            }
        );

        // Add InventoryStock for location A and B
        db.InventoryStocks.AddRange(
            new InventoryStock
            {
                Id = Guid.NewGuid(),
                ProductId = product.Id,
                StorageLocationId = locationA.Id,
                LevelNo = 1,
                ContainerCount = 5,
                UpdatedAt = DateTimeOffset.UtcNow
            },
            new InventoryStock
            {
                Id = Guid.NewGuid(),
                ProductId = product.Id,
                StorageLocationId = locationB.Id,
                LevelNo = 2,
                ContainerCount = 3,
                UpdatedAt = DateTimeOffset.UtcNow
            }
        );
        await db.SaveChangesAsync();

        var handler = new GetProductInventoryContextHandler(db);
        var result = await handler.HandleAsync(product.Id);

        Assert.Equal(product.Id, result.ProductId);
        Assert.Equal(product.Sku, result.Sku);
        Assert.Equal(product.Name, result.ProductName);
        Assert.Equal(2, result.TotalContainers);
        Assert.Equal(1, result.ContainersByStatus[ContainerStatus.CREATED.ToString()]);
        Assert.Equal(1, result.ContainersByStatus[ContainerStatus.STORED.ToString()]);

        Assert.Equal(2, result.StorageLocations.Count);
        Assert.Contains(result.StorageLocations, s => s.StorageLocationCode == "LOC-A1" && s.ContainerCount == 5);
        Assert.Contains(result.StorageLocations, s => s.StorageLocationCode == "LOC-B1" && s.ContainerCount == 3);
    }

    [Fact]
    public async Task HandleAsync_throws_NotFoundException_when_product_does_not_exist()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(HandleAsync_throws_NotFoundException_when_product_does_not_exist));
        var handler = new GetProductInventoryContextHandler(db);

        await Assert.ThrowsAsync<NotFoundException>(() => handler.HandleAsync(Guid.NewGuid()));
    }
}
