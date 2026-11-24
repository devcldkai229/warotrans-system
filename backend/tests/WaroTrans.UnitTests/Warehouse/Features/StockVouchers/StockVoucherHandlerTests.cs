using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.AddStockVoucherLines;
using WaroTrans.Warehouse.Features.CloseStockVoucherShort;
using WaroTrans.Warehouse.Features.ContainerContents;
using WaroTrans.Warehouse.Features.ListContainers;
using WaroTrans.Warehouse.Features.ConfirmStockVoucher;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Features.CreateStockVoucher;
using WaroTrans.Warehouse.Features.Shared;
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

    private CreateStockVoucherHandler Create()
    {
        var db = Db();
        return new CreateStockVoucherHandler(
            db, new FakeBusinessCodeGenerator(), _user, new CreateStockVoucherValidator(),
            new AddStockVoucherLinesHandler(db, _transports, _user, new AddStockVoucherLinesValidator(), NullLogger<AddStockVoucherLinesHandler>.Instance),
            new ConfirmStockVoucherHandler(db, _transports, _user, NullLogger<ConfirmStockVoucherHandler>.Instance, _map),
            NullLogger<CreateStockVoucherHandler>.Instance);
    }

    private async Task<Guid> CreateVoucherAsync(StockVoucherType type) =>
        (await Create().HandleAsync(new CreateStockVoucherRequest(WarehouseId, type))).Id;

    private async Task<StockVoucherDetailResponse> CreateConfirmedAsync(StockVoucherType type, params Guid[] containers) =>
        await Create().HandleAsync(new CreateStockVoucherRequest(WarehouseId, type, ContainerIds: containers, Confirm: true));

    private AddStockVoucherLinesHandler AddLines() =>
        new(Db(), _transports, _user, new AddStockVoucherLinesValidator(), NullLogger<AddStockVoucherLinesHandler>.Instance);

    private ConfirmStockVoucherHandler Confirm() =>
        new(Db(), _transports, _user, NullLogger<ConfirmStockVoucherHandler>.Instance, _map);

    private CloseStockVoucherShortHandler CloseShort() =>
        new(Db(), _transports, _user, NullLogger<CloseStockVoucherShortHandler>.Instance);

    /// <summary>A STORED Container sits on <paramref name="shelf"/> with its box booked there; others are just received.</summary>
    private async Task<Guid> SeedContainerAsync(ContainerStatus status, Guid? shelf, DateTimeOffset createdAt, bool bookStock = true)
    {
        await using var db = Db();
        var stored = status == ContainerStatus.STORED && shelf.HasValue;
        var container = new Container
        {
            Id = Guid.NewGuid(),
            ProductId = ProductId,
            Barcode = $"CTN-{createdAt:HHmmssfff}-{Guid.NewGuid():N}",
            Status = status,
            CurrentStorageLocationId = shelf,
            CurrentLevelNo = shelf.HasValue ? (short)1 : null,
            WarehouseId = stored ? (shelf == OtherShelf ? OtherWarehouseId : WarehouseId) : null,
            InventoryStorageLocationId = stored ? shelf : null,
            InventoryLevelNo = stored ? (short)1 : null,
            ContentsQuantity = 10,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
        db.Containers.Add(container);
        if (stored && bookStock)
        {
            var row = await db.InventoryStocks.SingleOrDefaultAsync(s => s.ProductId == ProductId && s.StorageLocationId == shelf && s.LevelNo == 1);
            if (row is null)
            {
                db.InventoryStocks.Add(new InventoryStock
                {
                    Id = Guid.NewGuid(), ProductId = ProductId, StorageLocationId = shelf!.Value, LevelNo = 1, ContainerCount = 1, UpdatedAt = createdAt
                });
            }
            else
            {
                row.ContainerCount++;
            }
        }

        await db.SaveChangesAsync();
        return container.Id;
    }

    [Fact]
    public async Task Create_uses_the_PX_code_for_outbound()
    {
        var response = await Create().HandleAsync(new CreateStockVoucherRequest(WarehouseId, StockVoucherType.OUTBOUND, "SO-1"));

        Assert.Equal("PX-20261006-000001", response.Code);
        Assert.Equal("DRAFT", response.Status);
        Assert.Equal("Main", response.WarehouseName);
        Assert.Equal(0, response.ContainerCount);
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
    }

    [Fact]
    public async Task Outbound_rejects_a_container_of_another_warehouse()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, OtherShelf, DateTimeOffset.UtcNow);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container])));

        Assert.Equal("voucher_container_not_on_shelf", ex.Code);
    }

    [Fact]
    public async Task Outbound_rejects_a_container_without_booked_stock()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow, bookStock: false);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container])));

        Assert.Equal("inventory_balance_missing", ex.Code);
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
    public async Task Outbound_confirm_revalidates_that_the_container_is_on_its_shelf()
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

        Assert.Equal("voucher_container_not_on_shelf", ex.Code);
    }

    [Fact]
    public async Task Outbound_confirm_reserves_without_moving_stock()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);
        var voucherId = await CreateVoucherAsync(StockVoucherType.OUTBOUND);
        await AddLines().HandleAsync(voucherId, new AddStockVoucherLinesRequest([container]));

        var confirmed = await Confirm().HandleAsync(voucherId);

        Assert.Equal("CONFIRMED", confirmed.Status);
        Assert.Equal(0, confirmed.DoneCount);
        await using var db = Db();
        Assert.Equal(ContainerStatus.STORED, (await db.Containers.SingleAsync(c => c.Id == container)).Status);
        Assert.Equal(1, (await db.InventoryStocks.SingleAsync(s => s.StorageLocationId == Shelf)).ContainerCount);
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

    [Theory]
    [InlineData(StockVoucherType.INBOUND)]
    [InlineData(StockVoucherType.OUTBOUND)]
    public async Task Create_and_confirm_in_one_call(StockVoucherType type)
    {
        var container = type == StockVoucherType.INBOUND
            ? await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow)
            : await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);

        var created = (await CreateConfirmedAsync(type, container));

        Assert.Equal("CONFIRMED", created.Status);
        Assert.NotNull(created.ConfirmedAt);
        Assert.Equal(container, Assert.Single(created.Lines).ContainerId);
        if (type == StockVoucherType.INBOUND)
        {
            await using var db = Db();
            Assert.Equal(created.Id, (await db.Containers.SingleAsync(c => c.Id == container)).InboundStockVoucherId);
        }
    }

    [Fact]
    public async Task Create_with_containers_but_no_confirm_stays_a_draft()
    {
        var container = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);

        var created = await Create().HandleAsync(new CreateStockVoucherRequest(WarehouseId, StockVoucherType.INBOUND, ContainerIds: [container]));

        Assert.Equal("DRAFT", created.Status);
        Assert.Single(created.Lines);
    }

    [Fact]
    public async Task Create_and_confirm_leaves_nothing_behind_when_a_container_is_not_eligible()
    {
        var container = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);

        await Assert.ThrowsAsync<DomainValidationException>(() =>
            Create().HandleAsync(new CreateStockVoucherRequest(WarehouseId, StockVoucherType.OUTBOUND, ContainerIds: [container], Confirm: true)));

        Assert.Empty(Db().StockVouchers);
    }

    [Fact]
    public async Task Confirm_without_containers_is_refused_by_the_validator()
    {
        var result = await new CreateStockVoucherValidator().ValidateAsync(
            new CreateStockVoucherRequest(WarehouseId, StockVoucherType.INBOUND, Confirm: true));

        Assert.False(result.IsValid);
    }

    [Fact]
    public async Task Closing_an_inbound_voucher_short_keeps_shelved_boxes_and_releases_the_rest()
    {
        var shelved = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);
        var waiting = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);
        var voucher = (await CreateConfirmedAsync(StockVoucherType.INBOUND, shelved, waiting));
        await using (var db = Db())
        {
            var box = await db.Containers.SingleAsync(c => c.Id == shelved);
            box.Status = ContainerStatus.STORED;
            box.CurrentStorageLocationId = Shelf;
            box.InventoryStorageLocationId = Shelf;
            box.InventoryLevelNo = 1;
            box.WarehouseId = WarehouseId;
            await db.SaveChangesAsync();
        }

        var closed = await CloseShort().HandleAsync(voucher.Id, new CloseStockVoucherShortRequest("Job cancelled"));

        Assert.Equal("COMPLETED", closed.Status);
        Assert.Equal(1, closed.DoneCount);
        Assert.Equal(1, closed.ClosedShortCount);
        Assert.Equal("Job cancelled", closed.ClosedShortReason);
        Assert.True(closed.Lines.Single(l => l.ContainerId == waiting).ClosedShort);
        await using (var check = Db())
        {
            Assert.Null((await check.Containers.SingleAsync(c => c.Id == waiting)).InboundStockVoucherId);
            Assert.Equal(voucher.Id, (await check.Containers.SingleAsync(c => c.Id == shelved)).InboundStockVoucherId);
        }

        // The released box can go on a new phiếu nhập.
        var again = (await CreateConfirmedAsync(StockVoucherType.INBOUND, waiting));
        Assert.Equal("CONFIRMED", again.Status);
    }

    [Fact]
    public async Task Closing_an_outbound_voucher_short_with_nothing_issued_cancels_it_and_frees_the_boxes()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);
        var voucher = (await CreateConfirmedAsync(StockVoucherType.OUTBOUND, container));

        var closed = await CloseShort().HandleAsync(voucher.Id, new CloseStockVoucherShortRequest("Order withdrawn"));

        Assert.Equal("CANCELLED", closed.Status);
        var again = (await CreateConfirmedAsync(StockVoucherType.OUTBOUND, container));
        Assert.Equal("CONFIRMED", again.Status);
    }

    [Fact]
    public async Task Closing_short_is_refused_while_a_box_is_moving_or_still_on_a_robot()
    {
        var container = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow);
        var voucher = (await CreateConfirmedAsync(StockVoucherType.OUTBOUND, container));

        _transports.Moving.Add(container);
        var moving = await Assert.ThrowsAsync<ConflictException>(() =>
            CloseShort().HandleAsync(voucher.Id, new CloseStockVoucherShortRequest("why")));
        Assert.Equal("voucher_container_in_transport", moving.Code);

        _transports.Moving.Clear();
        await using (var db = Db())
        {
            var box = await db.Containers.SingleAsync(c => c.Id == container);
            box.Status = ContainerStatus.IN_TRANSIT;
            box.CurrentStorageLocationId = null;
            await db.SaveChangesAsync();
        }

        var carried = await Assert.ThrowsAsync<ConflictException>(() =>
            CloseShort().HandleAsync(voucher.Id, new CloseStockVoucherShortRequest("why")));
        Assert.Equal("voucher_container_in_transit", carried.Code);
        var noReason = await Assert.ThrowsAsync<DomainValidationException>(() =>
            CloseShort().HandleAsync(voucher.Id, new CloseStockVoucherShortRequest(" ")));
        Assert.Equal("voucher_close_reason_required", noReason.Code);
    }

    // ------------------------------------------------------------------ box contents (how many goods), before admission

    private sealed class RecordingAudit : IAuditTrail
    {
        public List<AuditEntry> Entries { get; } = [];

        public Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default)
        {
            Entries.Add(entry);
            return Task.CompletedTask;
        }
    }

    private SetContainerContentsHandler Contents(IAuditTrail? audit = null) =>
        new(Db(), audit ?? new RecordingAudit(), TimeProvider.System);

    [Fact]
    public async Task Received_boxes_get_their_counted_quantity_even_on_a_draft_voucher()
    {
        var loose = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);
        var onDraft = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow.AddSeconds(1));
        await Create().HandleAsync(new CreateStockVoucherRequest(WarehouseId, StockVoucherType.INBOUND, ContainerIds: [onDraft]));
        var audit = new RecordingAudit();

        var result = await Contents(audit).HandleAsync(new SetContainerContentsRequest([new(loose, 24), new(onDraft, 12.5m)]), default);

        await using var db = Db();
        Assert.Equal(24, (await db.Containers.SingleAsync(c => c.Id == loose)).ContentsQuantity);
        Assert.Equal(12.5m, (await db.Containers.SingleAsync(c => c.Id == onDraft)).ContentsQuantity);
        Assert.Equal(2, result.Count);
        Assert.Equal(2, audit.Entries.Count);
    }

    [Fact]
    public async Task An_admitted_box_keeps_its_quantity()
    {
        var admitted = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);
        await using (var db = Db())
        {
            (await db.Containers.SingleAsync(c => c.Id == admitted)).InboundStockVoucherId = Guid.NewGuid();
            await db.SaveChangesAsync();
        }

        var stored = await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow.AddSeconds(1));

        Assert.Equal("container_contents_locked", (await Assert.ThrowsAsync<ConflictException>(() =>
            Contents().HandleAsync(new SetContainerContentsRequest([new(admitted, 5)]), default))).Code);
        Assert.Equal("container_contents_locked", (await Assert.ThrowsAsync<ConflictException>(() =>
            Contents().HandleAsync(new SetContainerContentsRequest([new(stored, 5)]), default))).Code);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1.0001)]
    public async Task A_quantity_must_be_positive_with_three_decimals_at_most(double quantity)
    {
        var box = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);

        var refused = await Assert.ThrowsAsync<DomainValidationException>(() =>
            Contents().HandleAsync(new SetContainerContentsRequest([new(box, (decimal)quantity)]), default));

        Assert.Equal("container_contents_invalid", refused.Code);
    }

    [Fact]
    public async Task An_inbound_voucher_refuses_a_box_that_does_not_say_how_many_goods_it_holds()
    {
        var box = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);
        await using (var db = Db())
        {
            (await db.Containers.SingleAsync(c => c.Id == box)).ContentsQuantity = null;
            await db.SaveChangesAsync();
        }

        var refused = await Assert.ThrowsAsync<DomainValidationException>(() =>
            Create().HandleAsync(new CreateStockVoucherRequest(WarehouseId, StockVoucherType.INBOUND, ContainerIds: [box])));

        Assert.Equal("container_contents_incomplete", refused.Code);
    }

    [Fact]
    public async Task Awaiting_inbound_lists_received_boxes_on_no_open_inbound_voucher()
    {
        var free = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow);
        var onDraft = await SeedContainerAsync(ContainerStatus.CREATED, null, DateTimeOffset.UtcNow.AddSeconds(1));
        await SeedContainerAsync(ContainerStatus.STORED, Shelf, DateTimeOffset.UtcNow.AddSeconds(2));
        await Create().HandleAsync(new CreateStockVoucherRequest(WarehouseId, StockVoucherType.INBOUND, ContainerIds: [onDraft]));

        var listed = await new ListContainersHandler(Db(), _transports).HandleAsync(
            new ListContainersRequest(WarehouseId, null, true, 50, AwaitingInbound: true), default);

        Assert.Equal([free], listed.Items.Select(i => i.Id));
    }
}
