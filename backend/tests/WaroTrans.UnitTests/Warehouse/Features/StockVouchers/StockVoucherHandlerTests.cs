using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Contracts;
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
    private static readonly Guid Gate = Guid.NewGuid();
    private static readonly Guid ProductId = Guid.NewGuid();

    private readonly string _dbName = $"vouchers-{Guid.NewGuid()}";
    private readonly FakeCurrentUser _user = new(Guid.NewGuid());
    private readonly FakeContainerTransportLookup _transports = new();

    private readonly FakeReceivingEndpointCatalog _map = new();

    public StockVoucherHandlerTests()
    {
        _map.Published.Add(new MapEndpointSnapshot(Gate, Guid.NewGuid(), "EP-OUTBOUND-1", "Outbound 1", "WAYPOINT", true));
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
        new(Db(), _transports, _user, new AddStockVoucherLinesValidator(), NullLogger<AddStockVoucherLinesHandler>.Instance, _map);

    private ConfirmStockVoucherHandler Confirm() =>
        new(Db(), _transports, _user, NullLogger<ConfirmStockVoucherHandler>.Instance, _map);

    private async Task<Guid> SeedContainerAsync(ContainerStatus status, Guid? shelf, DateTimeOffset createdAt)
    {
        await using var db = Db();
        var container = new Container
        {
            Id = Guid.NewGuid(),
            ProductId = ProductId,
            Barcode = $"CTN-{createdAt:HHmmssfff}-{Guid.NewGuid():N}",
            Status = status,
            CurrentStorageLocationId = status == ContainerStatus.STAGED_OUTBOUND ? null : shelf,
            CurrentLevelNo = status == ContainerStatus.STAGED_OUTBOUND ? null : shelf.HasValue ? (short)1 : null,
            CurrentEndpointId = status == ContainerStatus.STAGED_OUTBOUND ? Gate : null,
            WarehouseId = status == ContainerStatus.STAGED_OUTBOUND ? (shelf == OtherShelf ? OtherWarehouseId : WarehouseId) : null,
            InventoryStorageLocationId = status == ContainerStatus.STAGED_OUTBOUND ? shelf : null,
            InventoryLevelNo = status == ContainerStatus.STAGED_OUTBOUND ? (short)1 : null,
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
    public async Task A_container_on_one_live_outbound_voucher_cannot_go_on_another()
    {
        var container = await SeedContainerAsync(ContainerStatus.STAGED_OUTBOUND, Shelf, DateTimeOffset.UtcNow);
        var first = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        var second = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        await AddLines().HandleAsync(first, new AddStockVoucherLinesRequest([container]));

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            AddLines().HandleAsync(second, new AddStockVoucherLinesRequest([container])));
        Assert.Equal("voucher_container_on_other_voucher", ex.Code);


    }

    [Fact]
    public async Task Outbound_rejects_a_container_of_another_warehouse()
    {
        var container = await SeedContainerAsync(ContainerStatus.STAGED_OUTBOUND, OtherShelf, DateTimeOffset.UtcNow);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container])));

        Assert.Equal("voucher_container_not_at_outbound", ex.Code);
    }

    [Fact]
    public async Task Validator_requires_explicit_container_ids()
    {
        var validator = new AddStockVoucherLinesValidator();

        Assert.False((await validator.ValidateAsync(new AddStockVoucherLinesRequest())).IsValid);
        Assert.False((await validator.ValidateAsync(new AddStockVoucherLinesRequest([Guid.NewGuid()], ProductId, 1))).IsValid);
        Assert.False((await validator.ValidateAsync(new AddStockVoucherLinesRequest(ProductId: ProductId))).IsValid);
        Assert.False((await validator.ValidateAsync(new AddStockVoucherLinesRequest(ProductId: ProductId, Count: 3))).IsValid);
        Assert.True((await validator.ValidateAsync(new AddStockVoucherLinesRequest([Guid.NewGuid()]))).IsValid);
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
    public async Task Outbound_confirm_revalidates_the_staging_state()
    {
        var container = await SeedContainerAsync(ContainerStatus.STAGED_OUTBOUND, Shelf, DateTimeOffset.UtcNow);
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

        Assert.Equal("voucher_container_not_at_outbound", ex.Code);
    }

    [Fact]
    public async Task A_container_in_transport_cannot_be_added_or_confirmed()
    {
        var container = await SeedContainerAsync(ContainerStatus.STAGED_OUTBOUND, Shelf, DateTimeOffset.UtcNow);
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
