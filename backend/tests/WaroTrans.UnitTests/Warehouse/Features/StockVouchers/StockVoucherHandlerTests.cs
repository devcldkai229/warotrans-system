using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.AddStockVoucherLines;
using WaroTrans.Warehouse.Features.ConfirmStockVoucher;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Features.CreateStockVoucher;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.UnitTests.Warehouse.Features.StockVouchers;

public sealed class StockVoucherHandlerTests
{
    private static readonly Guid WarehouseId = Guid.NewGuid();
    private static readonly Guid OtherWarehouseId = Guid.NewGuid();
    private static readonly Guid Shelf = Guid.NewGuid();
    private static readonly Guid OtherShelf = Guid.NewGuid();
    private static readonly Guid ProductId = Guid.NewGuid();

    private readonly string _dbName = $"vouchers-{Guid.NewGuid()}";
    private readonly FakeCurrentUser _user = new(Guid.NewGuid());
    private readonly FakeContainerTransportLookup _transports = new();

    public StockVoucherHandlerTests()
    {
        using var db = Db();
        db.Warehouses.AddRange(
            new WaroTrans.Warehouse.Entities.Warehouse { Id = WarehouseId, Code = "WH-001", Name = "Main", IsActive = true },
            new WaroTrans.Warehouse.Entities.Warehouse { Id = OtherWarehouseId, Code = "WH-002", Name = "Other", IsActive = true });
        db.StorageLocations.AddRange(
            new StorageLocation { Id = Shelf, WarehouseId = WarehouseId, EndpointId = Guid.NewGuid(), Code = "A", Name = "A", IsActive = true },
            new StorageLocation { Id = OtherShelf, WarehouseId = OtherWarehouseId, EndpointId = Guid.NewGuid(), Code = "X", Name = "X", IsActive = true });
        db.Products.Add(new Product { Id = ProductId, CategoryId = Guid.NewGuid(), Sku = "SKU-1", Name = "Bin", IsActive = true });
        db.SaveChanges();
    }

    private WarehouseDbContext Db() => WarehouseTestDbContextFactory.Create(_dbName);

    private async Task<Guid> CreateVoucherAsync(StockVoucherType type)
    {
        var handler = new CreateStockVoucherHandler(
            Db(), new FakeBusinessCodeGenerator(), _user, new CreateStockVoucherValidator(), NullLogger<CreateStockVoucherHandler>.Instance);
        return (await handler.HandleAsync(new CreateStockVoucherRequest(WarehouseId, type))).Id;
    }

    private AddStockVoucherLinesHandler AddLines() =>
        new(Db(), _transports, _user, new AddStockVoucherLinesValidator(), NullLogger<AddStockVoucherLinesHandler>.Instance);

    private ConfirmStockVoucherHandler Confirm() =>
        new(Db(), _transports, _user, NullLogger<ConfirmStockVoucherHandler>.Instance);

    private async Task<Guid> SeedContainerAsync(ContainerStatus status, Guid? shelf, DateTimeOffset createdAt)
    {
        await using var db = Db();
        var container = new Container
        {
            Id = Guid.NewGuid(),
            ProductId = ProductId,
            Barcode = $"CTN-{createdAt:HHmmssfff}-{Guid.NewGuid():N}",
            Status = status,
            CurrentStorageLocationId = shelf,
            CurrentLevelNo = shelf.HasValue ? (short)1 : null,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
        db.Containers.Add(container);
        await db.SaveChangesAsync();
        return container.Id;
    }

    [Fact]
    public async Task Create_uses_the_PX_code_for_outbound()
    {
        var handler = new CreateStockVoucherHandler(
            Db(), new FakeBusinessCodeGenerator(), _user, new CreateStockVoucherValidator(), NullLogger<CreateStockVoucherHandler>.Instance);

        var response = await handler.HandleAsync(new CreateStockVoucherRequest(WarehouseId, StockVoucherType.OUTBOUND, "SO-1"));

        Assert.Equal("PX-20261006-000001", response.Code);
        Assert.Equal("DRAFT", response.Status);
        Assert.Equal("Main", response.WarehouseName);
        Assert.Equal(0, response.ContainerCount);
    }

    [Fact]
    public async Task Outbound_pick_by_product_takes_the_oldest_stored_containers_of_the_warehouse()
    {
        var t0 = DateTimeOffset.UtcNow.AddDays(-3);
        var oldest = await SeedContainerAsync(ContainerStatus.STORED, Shelf, t0);
        var second = await SeedContainerAsync(ContainerStatus.STORED, Shelf, t0.AddHours(1));
        await SeedContainerAsync(ContainerStatus.STORED, Shelf, t0.AddHours(2));
        await SeedContainerAsync(ContainerStatus.STORED, OtherShelf, t0.AddMinutes(-5));
        await SeedContainerAsync(ContainerStatus.CREATED, null, t0.AddMinutes(-10));
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);

        var response = await AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest(ProductId: ProductId, Count: 2));

        Assert.Equal([oldest, second], response.Lines.Select(l => l.ContainerId));
        Assert.Equal(2, response.ContainerCount);
        Assert.Equal(0, response.DoneCount);
        var product = Assert.Single(response.Products);
        Assert.Equal(2, product.ContainerCount);
    }

    [Fact]
    public async Task Outbound_pick_fails_when_not_enough_containers_are_free()
    {
        await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest(ProductId: ProductId, Count: 2)));

        Assert.Equal("not_enough_stored_containers", ex.Code);
    }

    [Fact]
    public async Task A_container_on_one_live_outbound_voucher_cannot_go_on_another()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);
        var first = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        var second = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        await AddLines().HandleAsync(first, new AddStockVoucherLinesRequest([container]));

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            AddLines().HandleAsync(second, new AddStockVoucherLinesRequest([container])));
        Assert.Equal("voucher_container_on_other_voucher", ex.Code);

        // The FIFO pick skips it as well.
        var pick = await Assert.ThrowsAsync<DomainValidationException>(() =>
            AddLines().HandleAsync(second, new AddStockVoucherLinesRequest(ProductId: ProductId, Count: 1)));
        Assert.Equal("not_enough_stored_containers", pick.Code);
    }

    [Fact]
    public async Task Outbound_rejects_a_container_of_another_warehouse()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, OtherShelf, DateTimeOffset.UtcNow);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container])));

        Assert.Equal("voucher_container_wrong_warehouse", ex.Code);
    }

    [Fact]
    public async Task Validator_wants_either_container_ids_or_a_product_pick()
    {
        var validator = new AddStockVoucherLinesValidator();

        Assert.False((await validator.ValidateAsync(new AddStockVoucherLinesRequest())).IsValid);
        Assert.False((await validator.ValidateAsync(new AddStockVoucherLinesRequest([Guid.NewGuid()], ProductId, 1))).IsValid);
        Assert.False((await validator.ValidateAsync(new AddStockVoucherLinesRequest(ProductId: ProductId))).IsValid);
        Assert.True((await validator.ValidateAsync(new AddStockVoucherLinesRequest(ProductId: ProductId, Count: 3))).IsValid);
    }

    [Fact]
    public async Task Creating_a_container_on_an_inbound_voucher_adds_the_line_in_the_same_save()
    {
        var voucherId = await CreateVoucherAsync(StockVoucherType.INBOUND);
        var handler = new CreateContainerHandler(
            Db(), new FakeBusinessCodeGenerator(), _user, new CreateContainerValidator(), NullLogger<CreateContainerHandler>.Instance);

        var container = await handler.HandleAsync(new CreateContainerRequest(ProductId, StockVoucherId: voucherId));

        var line = Assert.Single(Db().StockVoucherLines.Where(l => l.StockVoucherId == voucherId));
        Assert.Equal(container.Id, line.ContainerId);
        Assert.Equal(ProductId, line.ProductId);
    }

    [Fact]
    public async Task Creating_a_container_on_an_outbound_voucher_is_rejected()
    {
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        var handler = new CreateContainerHandler(
            Db(), new FakeBusinessCodeGenerator(), _user, new CreateContainerValidator(), NullLogger<CreateContainerHandler>.Instance);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(new CreateContainerRequest(ProductId, StockVoucherId: voucherId)));

        Assert.Equal("voucher_not_inbound", ex.Code);
        Assert.Empty(Db().Containers);
    }

    [Fact]
    public async Task Confirm_rejects_a_container_that_moved_since_it_was_added()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        await AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container]));
        await using (var db = Db())
        {
            var moved = await db.Containers.SingleAsync(c => c.Id == container);
            moved.Status = ContainerStatus.ISSUED;
            moved.CurrentStorageLocationId = null;
            await db.SaveChangesAsync();
        }

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() => Confirm().HandleAsync(voucherId));

        Assert.Equal("voucher_container_not_eligible", ex.Code);
    }

    [Fact]
    public async Task Confirm_locks_the_voucher()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        await AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container]));

        var response = await Confirm().HandleAsync(voucherId);

        Assert.Equal("CONFIRMED", response.Status);
        Assert.Equal(_user.AccountId, response.ConfirmedBy);
    }

    [Fact]
    public async Task Fifo_pick_skips_a_container_a_robot_is_already_moving()
    {
        var t0 = DateTimeOffset.UtcNow.AddDays(-1);
        var moving = await SeedContainerAsync(ContainerStatus.STORED, Shelf, t0);
        var next = await SeedContainerAsync(ContainerStatus.STORED, Shelf, t0.AddHours(1));
        _transports.Moving.Add(moving);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);

        var response = await AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest(ProductId: ProductId, Count: 1));

        Assert.Equal(next, Assert.Single(response.Lines).ContainerId);
    }

    [Fact]
    public async Task A_container_in_transport_cannot_be_added_or_confirmed()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        _transports.Moving.Add(container);

        var add = await Assert.ThrowsAsync<ConflictException>(() =>
            AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container])));
        Assert.Equal("voucher_container_in_transport", add.Code);

        // Added while free, then a robot took it before the voucher was confirmed.
        _transports.Moving.Clear();
        await AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container]));
        _transports.Moving.Add(container);
        var confirm = await Assert.ThrowsAsync<ConflictException>(() => Confirm().HandleAsync(voucherId));
        Assert.Equal("voucher_container_in_transport", confirm.Code);
    }
}
