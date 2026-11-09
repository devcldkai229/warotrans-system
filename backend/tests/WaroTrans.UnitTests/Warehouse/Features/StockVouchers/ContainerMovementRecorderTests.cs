using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.Warehouse.Services;

namespace WaroTrans.UnitTests.Warehouse.Features.StockVouchers;

public sealed class ContainerMovementRecorderTests
{
    private static readonly Guid WarehouseId = Guid.NewGuid();
    private static readonly Guid ShelfA = Guid.NewGuid();
    private static readonly Guid ShelfB = Guid.NewGuid();
    private static readonly Guid ProductId = Guid.NewGuid();

    private readonly string _dbName = $"recorder-{Guid.NewGuid()}";

    private WarehouseDbContext Db() => WarehouseTestDbContextFactory.Create(_dbName);

    private ContainerMovementRecorder Recorder(WarehouseDbContext db) =>
        new(db, NullLogger<ContainerMovementRecorder>.Instance);

    private async Task<Guid> SeedContainerAsync(ContainerStatus status, Guid? shelf = null, short? level = null)
    {
        await using var db = Db();
        if (!db.StorageLocations.Any())
        {
            db.StorageLocations.AddRange(
                new StorageLocation { Id = ShelfA, WarehouseId = WarehouseId, EndpointId = Guid.NewGuid(), Code = "A", Name = "A", IsActive = true },
                new StorageLocation { Id = ShelfB, WarehouseId = WarehouseId, EndpointId = Guid.NewGuid(), Code = "B", Name = "B", IsActive = true });
        }

        var container = new Container
        {
            Id = Guid.NewGuid(),
            ProductId = ProductId,
            Barcode = $"CTN-{Guid.NewGuid():N}",
            Status = status,
            CurrentStorageLocationId = shelf,
            CurrentLevelNo = level,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Containers.Add(container);
        if (status == ContainerStatus.STORED && shelf.HasValue)
        {
            var stock = db.InventoryStocks.Local.FirstOrDefault(s => s.StorageLocationId == shelf && s.LevelNo == (level ?? 1))
                ?? db.InventoryStocks.FirstOrDefault(s => s.StorageLocationId == shelf && s.LevelNo == (level ?? 1));
            if (stock is null)
            {
                db.InventoryStocks.Add(new InventoryStock
                {
                    Id = Guid.NewGuid(),
                    ProductId = ProductId,
                    StorageLocationId = shelf.Value,
                    LevelNo = level ?? 1,
                    ContainerCount = 1,
                    UpdatedAt = DateTimeOffset.UtcNow
                });
            }
            else
            {
                stock.ContainerCount++;
            }
        }

        await db.SaveChangesAsync();
        return container.Id;
    }

    private async Task AddVoucherAsync(Guid containerId, StockVoucherType type, StockVoucherStatus status)
    {
        await using var db = Db();
        var voucher = new StockVoucher
        {
            Id = Guid.NewGuid(),
            Code = $"PX-{Guid.NewGuid():N}",
            Type = type,
            Status = status,
            WarehouseId = WarehouseId,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        voucher.Lines.Add(new StockVoucherLine { Id = Guid.NewGuid(), StockVoucherId = voucher.Id, LineNo = 1, ContainerId = containerId, ProductId = ProductId });
        db.StockVouchers.Add(voucher);
        await db.SaveChangesAsync();
    }

    private int Stock(Guid shelf, short level = 1) =>
        Db().InventoryStocks.Where(s => s.StorageLocationId == shelf && s.LevelNo == level).Select(s => s.ContainerCount).FirstOrDefault();

    private Container Load(Guid id) => Db().Containers.Single(c => c.Id == id);

    [Fact]
    public async Task Putaway_stores_the_container_and_adds_one_to_the_shelf()
    {
        var id = await SeedContainerAsync(ContainerStatus.CREATED);

        await Recorder(Db()).RecordDeliveredAsync(new ContainerDelivery(id, ShelfA, 2));

        var container = Load(id);
        Assert.Equal(ContainerStatus.STORED, container.Status);
        Assert.Equal(ShelfA, container.CurrentStorageLocationId);
        Assert.Equal((short)2, container.CurrentLevelNo);
        Assert.Equal(1, Stock(ShelfA, 2));
    }

    [Fact]
    public async Task Missing_level_means_level_one()
    {
        var id = await SeedContainerAsync(ContainerStatus.PACKED);

        await Recorder(Db()).RecordDeliveredAsync(new ContainerDelivery(id, ShelfA, null));

        Assert.Equal((short)1, Load(id).CurrentLevelNo);
        Assert.Equal(1, Stock(ShelfA));
    }

    [Fact]
    public async Task Same_delivery_twice_counts_once()
    {
        var id = await SeedContainerAsync(ContainerStatus.CREATED);
        var delivery = new ContainerDelivery(id, ShelfA, 1);

        await Recorder(Db()).RecordDeliveredAsync(delivery);
        await Recorder(Db()).RecordDeliveredAsync(delivery);

        Assert.Equal(1, Stock(ShelfA));
    }

    [Fact]
    public async Task Relocation_moves_one_container_between_shelves()
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);

        await Recorder(Db()).RecordDeliveredAsync(new ContainerDelivery(id, ShelfB, 3));

        Assert.Equal(1, Stock(ShelfA));
        Assert.Equal(1, Stock(ShelfB, 3));
        Assert.Equal(ShelfB, Load(id).CurrentStorageLocationId);
    }

    [Fact]
    public async Task Outbound_on_a_confirmed_voucher_issues_the_container()
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await AddVoucherAsync(id, StockVoucherType.OUTBOUND, StockVoucherStatus.CONFIRMED);

        await Recorder(Db()).RecordDeliveredAsync(new ContainerDelivery(id, null, null));
        await Recorder(Db()).RecordDeliveredAsync(new ContainerDelivery(id, null, null));

        var container = Load(id);
        Assert.Equal(ContainerStatus.ISSUED, container.Status);
        Assert.Null(container.CurrentStorageLocationId);
        Assert.Null(container.CurrentLevelNo);
        // The emptied shelf level keeps no zero row behind.
        Assert.False(Db().InventoryStocks.Any(s => s.StorageLocationId == ShelfA));
    }

    [Theory]
    [InlineData(StockVoucherStatus.DRAFT)]
    [InlineData(StockVoucherStatus.CANCELLED)]
    public async Task Off_shelf_drop_without_a_confirmed_outbound_voucher_changes_nothing(StockVoucherStatus voucherStatus)
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await AddVoucherAsync(id, StockVoucherType.OUTBOUND, voucherStatus);

        await Recorder(Db()).RecordDeliveredAsync(new ContainerDelivery(id, null, null));

        var container = Load(id);
        Assert.Equal(ContainerStatus.STORED, container.Status);
        Assert.Equal(ShelfA, container.CurrentStorageLocationId);
        Assert.Equal(1, Stock(ShelfA));
    }

    [Fact]
    public async Task Unknown_container_is_ignored()
    {
        await Recorder(Db()).RecordDeliveredAsync(new ContainerDelivery(Guid.NewGuid(), ShelfA, 1));

        Assert.Empty(Db().InventoryStocks);
    }
}
