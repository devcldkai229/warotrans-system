using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.Warehouse.Services;

namespace WaroTrans.UnitTests.Warehouse.Features.ContainerLifecycle;

/// <summary>A container is held where it is while an issue about it is open, and its resolution says what becomes of it.</summary>
public sealed class ContainerHoldTests
{
    private static readonly Guid WarehouseId = Guid.NewGuid();
    private static readonly Guid ShelfA = Guid.NewGuid();
    private static readonly Guid ShelfB = Guid.NewGuid();
    private static readonly Guid ProductId = Guid.NewGuid();
    private static readonly Guid InspectionPoint = Guid.NewGuid();
    private static readonly Guid Gate = Guid.NewGuid();

    private readonly string _dbName = $"holds-{Guid.NewGuid()}";
    private readonly Guid _issue = Guid.NewGuid();

    private WarehouseDbContext Db() => WarehouseTestDbContextFactory.Create(_dbName);

    private ContainerMovementRecorder Recorder(WarehouseDbContext db) => new(db, NullLogger<ContainerMovementRecorder>.Instance);

    private async Task<Guid> SeedAsync(ContainerStatus status, Guid? shelf = null, string? unit = null)
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
            Barcode = $"CTN-{Guid.NewGuid():N}"[..20],
            Status = status,
            CurrentStorageLocationId = shelf,
            CurrentLevelNo = shelf is null ? null : (short)1,
            ContentsQuantity = unit is null ? null : 24,
            ContentsUnit = unit,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Containers.Add(container);
        if (status == ContainerStatus.STORED && shelf is { } at)
            db.InventoryStocks.Add(new InventoryStock
            {
                Id = Guid.NewGuid(), ProductId = ProductId, StorageLocationId = at, LevelNo = 1, ContainerCount = 1, UpdatedAt = DateTimeOffset.UtcNow
            });
        await db.SaveChangesAsync();
        return container.Id;
    }

    private async Task<Container> LoadAsync(Guid id)
    {
        await using var db = Db();
        return await db.Containers.AsNoTracking().SingleAsync(c => c.Id == id);
    }

    private async Task<int> StockOnAsync(Guid shelf)
    {
        await using var db = Db();
        return await db.InventoryStocks.Where(s => s.StorageLocationId == shelf).SumAsync(s => s.ContainerCount);
    }

    private async Task<List<ContainerMovement>> MovementsAsync(Guid id)
    {
        await using var db = Db();
        return await db.ContainerMovements.AsNoTracking().Where(m => m.ContainerId == id).OrderBy(m => m.OccurredAt).ToListAsync();
    }

    private async Task HoldAsync(Guid id, ContainerHoldMode mode, Guid? at = null, string code = ContainerProblemCodes.ContainerDamaged)
    {
        await using var db = Db();
        await Recorder(db).HoldAsync(new ContainerHoldRequest(id, code, _issue, mode, at));
    }

    private async Task<ContainerHoldSnapshot> ReleaseAsync(Guid id, string outcome, decimal? quantity = null, Guid? issue = null)
    {
        await using var db = Db();
        return await Recorder(db).ReleaseAsync(new ContainerReleaseRequest(id, issue ?? _issue, outcome, quantity));
    }

    [Fact]
    public async Task A_container_on_its_shelf_is_held_there_and_its_stock_stays_counted()
    {
        var id = await SeedAsync(ContainerStatus.STORED, ShelfA);

        await HoldAsync(id, ContainerHoldMode.NOW, InspectionPoint);

        var held = await LoadAsync(id);
        Assert.Equal(ContainerStatus.HOLD, held.Status);
        Assert.Equal(ShelfA, held.CurrentStorageLocationId);
        Assert.Null(held.HoldEndpointId);
        Assert.Equal(ContainerProblemCodes.ContainerDamaged, held.HoldReasonCode);
        Assert.Equal(_issue, held.HoldIssueId);
        Assert.Equal(1, await StockOnAsync(ShelfA));
        var movement = Assert.Single(await MovementsAsync(id));
        Assert.Equal(ContainerMovementType.HELD, movement.Type);
        Assert.Equal(ContainerStatus.STORED, movement.FromStatus);

        await ReleaseAsync(id, ContainerHoldOutcomes.Release);

        var released = await LoadAsync(id);
        Assert.Equal(ContainerStatus.STORED, released.Status);
        Assert.Null(released.HoldReasonCode);
        Assert.Null(released.HoldIssueId);
        Assert.Equal(1, await StockOnAsync(ShelfA));
        Assert.Equal(ContainerMovementType.RELEASED, (await MovementsAsync(id))[^1].Type);
    }

    [Fact]
    public async Task A_new_box_at_the_inbound_gate_is_held_at_the_gate_and_released_to_what_it_was()
    {
        var id = await SeedAsync(ContainerStatus.CREATED);

        await HoldAsync(id, ContainerHoldMode.NOW, Gate);

        var held = await LoadAsync(id);
        Assert.Equal(ContainerStatus.HOLD, held.Status);
        Assert.Equal(Gate, held.HoldEndpointId);

        await ReleaseAsync(id, ContainerHoldOutcomes.Release);

        var released = await LoadAsync(id);
        Assert.Equal(ContainerStatus.CREATED, released.Status);
        Assert.Null(released.HoldEndpointId);
    }

    [Fact]
    public async Task A_container_set_down_off_the_robot_is_held_at_that_point_and_released_off_shelf()
    {
        var id = await SeedAsync(ContainerStatus.IN_TRANSIT);

        await HoldAsync(id, ContainerHoldMode.NOW, InspectionPoint, ContainerProblemCodes.QuantityMismatch);

        var held = await LoadAsync(id);
        Assert.Equal(ContainerStatus.HOLD, held.Status);
        Assert.Equal(InspectionPoint, held.HoldEndpointId);

        await ReleaseAsync(id, ContainerHoldOutcomes.Release);

        // Fine, but on no shelf: someone puts it on one (Recover), as for any container set down off a shelf.
        var released = await LoadAsync(id);
        Assert.Equal(ContainerStatus.HOLD, released.Status);
        Assert.Equal(Container.OffShelfHoldReason, released.HoldReasonCode);
        Assert.Equal(InspectionPoint, released.HoldEndpointId);
        Assert.Null(released.HoldIssueId);
    }

    [Fact]
    public async Task Reported_on_the_way_it_goes_on_and_is_held_where_it_is_delivered()
    {
        var id = await SeedAsync(ContainerStatus.IN_TRANSIT);

        await HoldAsync(id, ContainerHoldMode.ON_DELIVERY);
        Assert.Equal(ContainerStatus.IN_TRANSIT, (await LoadAsync(id)).Status);

        await using (var db = Db())
            await Recorder(db).RecordDeliveredAsync(new ContainerDelivery(id, ShelfB, 1, Guid.NewGuid(), Guid.NewGuid()));

        var delivered = await LoadAsync(id);
        Assert.Equal(ContainerStatus.HOLD, delivered.Status);
        Assert.Equal(ShelfB, delivered.CurrentStorageLocationId);
        Assert.Equal(1, await StockOnAsync(ShelfB));

        await ReleaseAsync(id, ContainerHoldOutcomes.Release);
        Assert.Equal(ContainerStatus.STORED, (await LoadAsync(id)).Status);
    }

    [Fact]
    public async Task Held_for_a_problem_it_is_never_issued_at_the_outbound_gate()
    {
        var id = await SeedAsync(ContainerStatus.IN_TRANSIT);
        await HoldAsync(id, ContainerHoldMode.ON_DELIVERY);

        await using (var db = Db())
            await Recorder(db).RecordDeliveredAsync(new ContainerDelivery(id, null, null, Guid.NewGuid(), Guid.NewGuid(), Gate, WarehouseId));

        var atGate = await LoadAsync(id);
        Assert.Equal(ContainerStatus.HOLD, atGate.Status);
        Assert.Equal(Gate, atGate.HoldEndpointId);
        Assert.Equal(ContainerProblemCodes.ContainerDamaged, atGate.HoldReasonCode);
    }

    [Fact]
    public async Task A_container_held_for_a_problem_cannot_be_recovered_until_its_issue_is_resolved()
    {
        var id = await SeedAsync(ContainerStatus.IN_TRANSIT);
        await HoldAsync(id, ContainerHoldMode.NOW, InspectionPoint);

        await using var db = Db();
        var refused = await Assert.ThrowsAsync<ConflictException>(() => Recorder(db).RecoverAsync(id, ShelfA, 1, null, null));

        Assert.Equal("container_held_for_issue", refused.Code);
    }

    [Fact]
    public async Task Only_the_issue_that_holds_it_releases_it()
    {
        var id = await SeedAsync(ContainerStatus.STORED, ShelfA);
        await HoldAsync(id, ContainerHoldMode.NOW);

        var refused = await Assert.ThrowsAsync<ConflictException>(() => ReleaseAsync(id, ContainerHoldOutcomes.Release, issue: Guid.NewGuid()));

        Assert.Equal("container_not_held_by_issue", refused.Code);
        Assert.Equal(ContainerStatus.HOLD, (await LoadAsync(id)).Status);
    }

    [Fact]
    public async Task Written_off_it_is_out_of_service_and_off_the_stock_of_its_shelf()
    {
        var id = await SeedAsync(ContainerStatus.STORED, ShelfA);
        await HoldAsync(id, ContainerHoldMode.NOW, code: ContainerProblemCodes.MissingContainer);

        await ReleaseAsync(id, ContainerHoldOutcomes.Lost);

        var gone = await LoadAsync(id);
        Assert.Equal(ContainerStatus.OUT_OF_SERVICE, gone.Status);
        Assert.Null(gone.CurrentStorageLocationId);
        Assert.Equal(0, await StockOnAsync(ShelfA));
    }

    [Fact]
    public async Task A_counted_quantity_is_recorded_and_the_container_is_back_in_use()
    {
        var id = await SeedAsync(ContainerStatus.STORED, ShelfA, unit: "bottle");
        await HoldAsync(id, ContainerHoldMode.NOW, code: ContainerProblemCodes.QuantityMismatch);

        var after = await ReleaseAsync(id, ContainerHoldOutcomes.AdjustQuantity, 20);

        Assert.Equal(20, after.ContentsQuantity);
        Assert.Equal("STORED", after.Status);
        Assert.Contains("quantity 20", (await MovementsAsync(id))[^1].Note);
    }

    [Fact]
    public async Task Adjusting_the_quantity_needs_the_counted_quantity()
    {
        var id = await SeedAsync(ContainerStatus.STORED, ShelfA, unit: "bottle");
        await HoldAsync(id, ContainerHoldMode.NOW);

        var refused = await Assert.ThrowsAsync<DomainValidationException>(() => ReleaseAsync(id, ContainerHoldOutcomes.AdjustQuantity));

        Assert.Equal("container_quantity_required", refused.Code);
    }

    [Fact]
    public async Task Holding_twice_for_the_same_issue_records_one_hold()
    {
        var id = await SeedAsync(ContainerStatus.STORED, ShelfA);

        await HoldAsync(id, ContainerHoldMode.NOW);
        await HoldAsync(id, ContainerHoldMode.NOW);

        Assert.Single(await MovementsAsync(id));
    }
    [Fact]
    public async Task Reported_while_at_rest_on_its_shelf_it_is_held_at_once()
    {
        var id = await SeedAsync(ContainerStatus.STORED, ShelfA);

        await HoldAsync(id, ContainerHoldMode.ON_DELIVERY, code: ContainerProblemCodes.ProductMismatch);

        var held = await LoadAsync(id);
        Assert.Equal(ContainerStatus.HOLD, held.Status);
        Assert.Equal(ShelfA, held.CurrentStorageLocationId);
    }

    [Fact]
    public async Task Scrapped_it_leaves_the_stock_like_a_lost_package()
    {
        var id = await SeedAsync(ContainerStatus.STORED, ShelfA);
        await HoldAsync(id, ContainerHoldMode.NOW, code: ContainerProblemCodes.ProductMismatch);

        await ReleaseAsync(id, ContainerHoldOutcomes.Scrap);

        Assert.Equal(ContainerStatus.OUT_OF_SERVICE, (await LoadAsync(id)).Status);
        Assert.Equal(0, await StockOnAsync(ShelfA));
        Assert.Contains("SCRAP after PRODUCT_MISMATCH", (await MovementsAsync(id))[^1].Note);
    }
}
