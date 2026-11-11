using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
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

    private static ContainerDelivery Delivery(Guid id, Guid? shelf, short? level, Guid? job = null) =>
        new(id, shelf, level, job ?? Guid.NewGuid(), Guid.NewGuid());

    private static ContainerPickup Pickup(Guid id, Guid job) => new(id, job, Guid.NewGuid());

    private int Movements(Guid id) => Db().ContainerMovements.Count(m => m.ContainerId == id);

    [Fact]
    public async Task Putaway_stores_the_container_and_adds_one_to_the_shelf()
    {
        var id = await SeedContainerAsync(ContainerStatus.CREATED);

        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, ShelfA, 2));

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

        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, ShelfA, null));

        Assert.Equal((short)1, Load(id).CurrentLevelNo);
        Assert.Equal(1, Stock(ShelfA));
    }

    [Fact]
    public async Task Pickup_takes_the_container_off_the_shelf_and_a_retry_changes_nothing()
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        var job = Guid.NewGuid();

        await Recorder(Db()).RecordPickedUpAsync(Pickup(id, job));
        await Recorder(Db()).RecordPickedUpAsync(Pickup(id, job));

        var container = Load(id);
        Assert.Equal(ContainerStatus.IN_TRANSIT, container.Status);
        Assert.Null(container.CurrentStorageLocationId);
        Assert.Null(container.CurrentLevelNo);
        Assert.Equal(1, Stock(ShelfA));
        Assert.Equal(1, Movements(id));
    }

    [Fact]
    public async Task Pickup_then_delivery_moves_one_container_and_writes_both_lines()
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        var job = Guid.NewGuid();

        await Recorder(Db()).RecordPickedUpAsync(Pickup(id, job));
        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, ShelfB, 3, job));
        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, ShelfB, 3, job));

        Assert.Equal(1, Stock(ShelfA));
        Assert.Equal(1, Stock(ShelfB, 3));
        Assert.Equal(ContainerStatus.STORED, Load(id).Status);
        Assert.Equal(ShelfB, Load(id).CurrentStorageLocationId);
        Assert.Equal(2, Movements(id));
    }

    [Fact]
    public async Task An_old_delivery_retried_after_a_newer_move_does_not_pull_the_container_back()
    {
        var id = await SeedContainerAsync(ContainerStatus.CREATED);
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();

        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, ShelfA, 1, first));
        await Recorder(Db()).RecordPickedUpAsync(Pickup(id, second));
        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, ShelfB, 1, second));
        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, ShelfA, 1, first));

        Assert.Equal(ShelfB, Load(id).CurrentStorageLocationId);
        Assert.Equal(0, Stock(ShelfA));
        Assert.Equal(1, Stock(ShelfB));
    }

    [Fact]
    public async Task Delivery_without_a_posted_pickup_still_takes_the_container_off_its_shelf()
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);

        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, ShelfB, 3));

        Assert.Equal(1, Stock(ShelfA));
        Assert.Equal(1, Stock(ShelfB, 3));
        Assert.Equal(ShelfB, Load(id).CurrentStorageLocationId);
    }

    [Fact]
    public async Task Outbound_on_a_confirmed_voucher_issues_the_container()
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await AddVoucherAsync(id, StockVoucherType.OUTBOUND, StockVoucherStatus.CONFIRMED);
        var job = Guid.NewGuid();

        await Recorder(Db()).RecordPickedUpAsync(Pickup(id, job));
        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, null, null, job));
        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, null, null, job));

        var container = Load(id);
        Assert.Equal(ContainerStatus.ISSUED, container.Status);
        Assert.Null(container.CurrentStorageLocationId);
        Assert.Null(container.CurrentLevelNo);
        // The emptied shelf level keeps no zero row behind.
        Assert.False(Db().InventoryStocks.Any(s => s.StorageLocationId == ShelfA));
        Assert.Contains(Db().ContainerMovements, m => m.ContainerId == id && m.Type == ContainerMovementType.ISSUED);
    }

    [Theory]
    [InlineData(StockVoucherStatus.DRAFT)]
    [InlineData(StockVoucherStatus.CANCELLED)]
    public async Task A_shelved_container_dropped_off_shelf_without_a_confirmed_voucher_is_on_hold(StockVoucherStatus voucherStatus)
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await AddVoucherAsync(id, StockVoucherType.OUTBOUND, voucherStatus);
        var job = Guid.NewGuid();

        await Recorder(Db()).RecordPickedUpAsync(Pickup(id, job));
        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, null, null, job));

        var container = Load(id);
        Assert.Equal(ContainerStatus.HOLD, container.Status);
        Assert.Null(container.CurrentStorageLocationId);
        Assert.Equal(0, Stock(ShelfA));
    }

    [Fact]
    public async Task A_never_shelved_container_dropped_off_shelf_keeps_its_status()
    {
        var id = await SeedContainerAsync(ContainerStatus.PACKED);
        var job = Guid.NewGuid();

        await Recorder(Db()).RecordPickedUpAsync(Pickup(id, job));
        Assert.Equal(ContainerStatus.IN_TRANSIT, Load(id).Status);

        await Recorder(Db()).RecordDeliveredAsync(Delivery(id, null, null, job));

        Assert.Equal(ContainerStatus.PACKED, Load(id).Status);
    }

    [Fact]
    public async Task Recover_puts_a_container_in_transit_on_the_shelf_a_person_named()
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);
        await Recorder(Db()).RecordPickedUpAsync(Pickup(id, Guid.NewGuid()));
        var actor = Guid.NewGuid();

        await Recorder(Db()).RecoverAsync(id, ShelfB, 2, " back on B ", actor);

        var container = Load(id);
        Assert.Equal(ContainerStatus.STORED, container.Status);
        Assert.Equal(ShelfB, container.CurrentStorageLocationId);
        Assert.Equal(1, Stock(ShelfB, 2));
        var line = Db().ContainerMovements.Single(m => m.Type == ContainerMovementType.RECOVERED);
        Assert.Equal(actor, line.ActorAccountId);
        Assert.Equal("back on B", line.Note);
        Assert.Equal(ContainerStatus.IN_TRANSIT, line.FromStatus);
    }

    [Fact]
    public async Task Recover_refuses_a_container_that_has_a_place()
    {
        var id = await SeedContainerAsync(ContainerStatus.STORED, ShelfA, 1);

        var error = await Assert.ThrowsAsync<ConflictException>(() => Recorder(Db()).RecoverAsync(id, ShelfB, 1, null, null));

        Assert.Equal("container_not_recoverable", error.Code);
        Assert.Equal(1, Stock(ShelfA));
    }

    [Fact]
    public async Task Unknown_container_is_ignored()
    {
        await Recorder(Db()).RecordDeliveredAsync(Delivery(Guid.NewGuid(), ShelfA, 1));

        Assert.Empty(Db().InventoryStocks);
    }
}
