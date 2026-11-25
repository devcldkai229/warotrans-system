using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Services;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.ConfirmStockVoucher;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Services;

namespace WaroTrans.IntegrationTests.Warehouse.CreateContainer;

public sealed partial class ContainerBatchPostgresTests
{
    private readonly TransportLookup _transportLookup = new();
    private const string Vouchers = "/api/warehouse/stock-vouchers";

    [IsolatedPostgresFact]
    public async Task Linked_batch_larger_than_200_creates_every_line_atomically_and_replays_the_same_receipt()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (request, result) = await LinkedAsync(client, 250);
        Assert.Equal(250, result.StockVoucher!.Lines.Count);
        Assert.Equal("DRAFT", result.StockVoucher.Status);
        Assert.Null(result.StockVoucher.StockPostedAt);
        var response = await client.PostAsJsonAsync(Route, request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var replay = (await response.Content.ReadFromJsonAsync<CreateContainerBatchResponse>())!;
        Assert.True(replay.Replayed);
        Assert.Equal(result.Items.Select(i => (i.Id, i.Barcode)), replay.Items.Select(i => (i.Id, i.Barcode)));
        Assert.Equal(result.StockVoucher.Lines.Select(l => l.Id), replay.StockVoucher!.Lines.Select(l => l.Id));
        var loaded = (await client.GetFromJsonAsync<StockVoucherDetailResponse>($"{Vouchers}/{request.StockVoucherId}"))!;
        Assert.Equal(250, loaded.Lines.Count);
        await using var db = Warehouse();
        Assert.Equal(250, await db.Containers.CountAsync());
        Assert.Equal(250, await db.StockVoucherLines.CountAsync());
        Assert.Empty(await db.InventoryStocks.ToListAsync());
    }

    [IsolatedPostgresFact]
    public async Task Maximum_batch_of_9999_boxes_attaches_and_posts_without_splitting_the_voucher()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (request, result) = await LinkedAsync(client, 9999);
        Assert.Equal(9999, result.StockVoucher!.Lines.Count);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"{Vouchers}/{request.StockVoucherId}/confirm", null)).StatusCode);
        Assert.Equal(9999, await TotalAsync());
    }

    [IsolatedPostgresFact]
    public async Task Invalid_voucher_bindings_do_not_create_any_container_or_line()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var cases = new[] { "wrong-warehouse", "outbound", "confirmed", "cancelled", "missing" };
        foreach (var scenario in cases)
        {
            var voucher = StockVoucher.Create($"PN-{scenario}", scenario == "outbound" ? StockVoucherType.OUTBOUND : StockVoucherType.INBOUND,
                scenario == "wrong-warehouse" ? Guid.NewGuid() : _warehouse, null, null, new TestActor().AccountId!.Value, DateTimeOffset.UtcNow);
            if (scenario == "confirmed") voucher.Status = StockVoucherStatus.CONFIRMED;
            if (scenario == "cancelled") voucher.Status = StockVoucherStatus.CANCELLED;
            await using (var db = Warehouse())
            {
                if (scenario != "missing") { db.StockVouchers.Add(voucher); await db.SaveChangesAsync(); }
            }
            var response = await client.PostAsJsonAsync(Route, Request() with { StockVoucherId = voucher.Id });
            Assert.Equal(scenario == "missing" ? HttpStatusCode.NotFound : scenario is "confirmed" or "cancelled" ? HttpStatusCode.Conflict : HttpStatusCode.BadRequest, response.StatusCode);
        }
        await using var check = Warehouse();
        Assert.Empty(await check.Containers.ToListAsync());
        Assert.Empty(await check.StockVoucherLines.ToListAsync());
    }

    [IsolatedPostgresFact]
    public async Task Linked_creation_failure_rolls_back_both_containers_and_voucher_lines()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var voucher = await DraftAsync(client);
        var request = Request() with { StockVoucherId = voucher.Id };
        await using (var db = Warehouse(new InvalidLastContainer()))
        await using (var codes = Codes())
            await Assert.ThrowsAsync<DbUpdateException>(() => Handler(db, new WaroTrans.BuildingBlocks.Persistence.CodeSequences.BusinessCodeGenerator(codes)).HandleAsync(request));
        await using var check = Warehouse();
        Assert.Empty(await check.Containers.ToListAsync());
        Assert.Empty(await check.StockVoucherLines.ToListAsync());
        var retried = await client.PostAsJsonAsync(Route, request);
        Assert.Equal(HttpStatusCode.OK, retried.StatusCode);
        Assert.Equal(10, (await retried.Content.ReadFromJsonAsync<CreateContainerBatchResponse>())!.StockVoucher!.Lines.Count);
    }

    [IsolatedPostgresFact]
    public async Task Parallel_linked_retries_keep_one_batch_and_one_complete_line_set()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var draft = await DraftAsync(client);
        var request = Request() with { StockVoucherId = draft.Id };
        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => client.PostAsJsonAsync(Route, request)));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var receipts = await Task.WhenAll(responses.Select(async r => (await r.Content.ReadFromJsonAsync<CreateContainerBatchResponse>())!));
        Assert.Single(receipts, r => !r.Replayed);
        Assert.All(receipts, r => Assert.Equal(10, r.StockVoucher!.Lines.Count));
        await using var db = Warehouse();
        Assert.Equal(10, await db.Containers.CountAsync());
        Assert.Equal(10, await db.StockVoucherLines.CountAsync());
        Assert.Empty(await db.InventoryStocks.ToListAsync());
    }

    [IsolatedPostgresFact]
    public async Task Inbound_confirm_putaway_and_retries_preserve_total_and_move_only_the_accounting_balance()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (request, batch) = await LinkedAsync(client);
        var confirm = await client.PostAsync($"{Vouchers}/{request.StockVoucherId}/confirm", null);
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        var receipt = (await confirm.Content.ReadFromJsonAsync<StockVoucherDetailResponse>())!;
        Assert.Equal("CONFIRMED", receipt.Status);
        Assert.NotNull(receipt.StockPostedAt);
        Assert.Equal(10, await TotalAsync());
        var rack = await RackAsync();
        await using (var db = Warehouse())
        {
            var recorder = new ContainerMovementRecorder(db, NullLogger<ContainerMovementRecorder>.Instance);
            foreach (var box in batch.Items)
            {
                var job = Guid.NewGuid();
                await recorder.RecordPickedUpAsync(new(box.Id, job, Guid.NewGuid()));
                Assert.Equal(10, await TotalAsync());
                Assert.Null((await db.Containers.FindAsync(box.Id))!.CurrentStorageLocationId);
                var delivery = new ContainerDelivery(box.Id, rack, 2, job, Guid.NewGuid());
                await recorder.RecordDeliveredAsync(delivery);
                await recorder.RecordDeliveredAsync(delivery);
                Assert.Equal(10, await TotalAsync());
            }
        }
        await using var check = Warehouse();
        Assert.Empty(await check.InventoryStocks.Where(s => s.StorageLocationId == _location).ToListAsync());
        Assert.Equal(10, await check.InventoryStocks.Where(s => s.StorageLocationId == rack && s.LevelNo == 2).SumAsync(s => s.ContainerCount));
        Assert.Equal(20, await check.ContainerMovements.CountAsync());
        // A retry after physical putaway/config or Product changes reads the posting receipt, without re-admission.
        await using (var changed = Warehouse()) { (await changed.Products.FindAsync(_productA))!.IsActive = false; await changed.SaveChangesAsync(); }
        var retry = await client.PostAsync($"{Vouchers}/{request.StockVoucherId}/confirm", null);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(receipt.StockPostedAt, (await retry.Content.ReadFromJsonAsync<StockVoucherDetailResponse>())!.StockPostedAt);
        Assert.Equal(10, await TotalAsync());
        var replay = await client.PostAsJsonAsync(Route, request);
        Assert.Equal("CONFIRMED", (await replay.Content.ReadFromJsonAsync<CreateContainerBatchResponse>())!.StockVoucher!.Status);
    }

    [IsolatedPostgresFact]
    public async Task Concurrent_confirms_and_different_vouchers_of_the_same_product_do_not_double_post_or_lose_updates()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (first, _) = await LinkedAsync(client);
        var (second, _) = await LinkedAsync(client);
        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(i => client.PostAsync($"{Vouchers}/{(i % 2 == 0 ? first : second).StockVoucherId}/confirm", null)));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(20, await TotalAsync());
        await using var check = Warehouse();
        Assert.Equal(2, await check.StockVouchers.CountAsync(v => v.StockPostedAt != null));
        Assert.All(await check.Containers.ToListAsync(), c => Assert.NotNull(c.InboundStockVoucherId));
    }

    [IsolatedPostgresFact]
    public async Task Confirm_validation_is_all_or_none_for_wrong_position_contents_inactive_product_or_active_transport()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        foreach (var scenario in new[] { "wrong-location", "contents", "inactive-product", "moving" })
        {
            var (request, batch) = await LinkedAsync(client);
            await using (var db = Warehouse())
            {
                if (scenario == "wrong-location") (await db.Containers.FindAsync(batch.Items[0].Id))!.CurrentStorageLocationId = _location;
                if (scenario == "contents")
                {
                    // Contents and receipt must remain structurally valid: use a legacy row attached to this draft.
                    var box = await db.Containers.FindAsync(batch.Items[0].Id);
                    box!.ContentsQuantity = null;
                    box.CreationRequestId = null; box.CreationRequestHash = null; box.CreationOrdinal = null;
                    box.CreationGroupKey = null; box.CreationGroupOrdinal = null;
                }
                if (scenario == "inactive-product") (await db.Products.FindAsync(_productB))!.IsActive = false;
                if (scenario == "moving") _transportLookup.Moving.Add(batch.Items[0].Id);
                await db.SaveChangesAsync();
            }
            var response = await client.PostAsync($"{Vouchers}/{request.StockVoucherId}/confirm", null);
            Assert.Contains(response.StatusCode, new[] { HttpStatusCode.BadRequest, HttpStatusCode.Conflict });
            await using var check = Warehouse();
            var voucher = await check.StockVouchers.FindAsync(request.StockVoucherId);
            Assert.Equal(StockVoucherStatus.DRAFT, voucher!.Status);
            Assert.Null(voucher.StockPostedAt);
            Assert.Equal(0, await TotalAsync());
            (await check.Products.FindAsync(_productB))!.IsActive = true;
            await check.SaveChangesAsync(); _transportLookup.Moving.Clear();
        }
    }

    [IsolatedPostgresFact]
    public async Task Posting_failure_rolls_back_document_balances_and_every_container_admission_marker()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (request, _) = await LinkedAsync(client);
        await using (var db = Warehouse(new InvalidLastContainer()))
        await using (var navigation = Navigation())
        {
            var handler = new ConfirmStockVoucherHandler(db, _transportLookup, new TestActor(), NullLogger<ConfirmStockVoucherHandler>.Instance,
                new MapEndpointCatalog(navigation));
            await Assert.ThrowsAsync<DbUpdateException>(() => handler.HandleAsync(request.StockVoucherId!.Value));
        }
        await using var check = Warehouse();
        Assert.Equal(0, await TotalAsync());
        Assert.Equal(StockVoucherStatus.DRAFT, (await check.StockVouchers.FindAsync(request.StockVoucherId))!.Status);
        Assert.All(await check.Containers.ToListAsync(), c => Assert.Null(c.InboundStockVoucherId));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"{Vouchers}/{request.StockVoucherId}/confirm", null)).StatusCode);
        Assert.Equal(10, await TotalAsync());
    }

    [IsolatedPostgresFact]
    public async Task A_batch_racing_with_confirm_is_either_fully_included_or_rejected_without_orphan_rows()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (request, _) = await LinkedAsync(client);
        var extra = request with { RequestId = Guid.NewGuid() };
        var batchTask = client.PostAsJsonAsync(Route, extra);
        var confirmTask = client.PostAsync($"{Vouchers}/{request.StockVoucherId}/confirm", null);
        await Task.WhenAll(batchTask, confirmTask);
        Assert.Equal(HttpStatusCode.OK, confirmTask.Result.StatusCode);
        Assert.Contains(batchTask.Result.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        var expected = batchTask.Result.StatusCode == HttpStatusCode.OK ? 20 : 10;
        await using var db = Warehouse();
        Assert.Equal(expected, await db.Containers.CountAsync());
        Assert.Equal(expected, await db.StockVoucherLines.CountAsync());
        Assert.Equal(expected, await TotalAsync());
    }

    [IsolatedPostgresFact]
    public async Task Recovery_after_an_endpoint_only_drop_transfers_existing_stock_instead_of_admitting_it_again()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (request, batch) = await LinkedAsync(client);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"{Vouchers}/{request.StockVoucherId}/confirm", null)).StatusCode);
        var rack = await RackAsync();
        await using var db = Warehouse();
        var recorder = new ContainerMovementRecorder(db, NullLogger<ContainerMovementRecorder>.Instance);
        var box = batch.Items[0].Id; var job = Guid.NewGuid();
        await recorder.RecordPickedUpAsync(new(box, job, Guid.NewGuid()));
        await recorder.RecordDeliveredAsync(new(box, null, null, job, Guid.NewGuid()));
        Assert.Equal(10, await TotalAsync());
        await recorder.RecoverAsync(box, rack, 1, "Moved by staff", new TestActor().AccountId);
        Assert.Equal(10, await TotalAsync());
        Assert.Equal(rack, (await db.Containers.FindAsync(box))!.InventoryStorageLocationId);
    }

    [IsolatedPostgresFact]
    public async Task Unposted_batches_and_legacy_document_only_confirms_cannot_be_treated_as_posted_stock()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (request, batch) = await LinkedAsync(client);
        await using (var db = Warehouse())
        {
            var recorder = new ContainerMovementRecorder(db, NullLogger<ContainerMovementRecorder>.Instance);
            var error = await Assert.ThrowsAsync<ConflictException>(() => recorder.RecordPickedUpAsync(new(batch.Items[0].Id, Guid.NewGuid(), Guid.NewGuid())));
            Assert.Equal("inbound_voucher_required", error.Code);
            (await db.StockVouchers.FindAsync(request.StockVoucherId))!.Status = StockVoucherStatus.CONFIRMED;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync($"{Vouchers}/{request.StockVoucherId}/confirm", null)).StatusCode);
        Assert.Equal(0, await TotalAsync());
        var outbound = await client.PostAsJsonAsync(Vouchers, new { warehouseId = _warehouse, type = "OUTBOUND" });
        var other = (await outbound.Content.ReadFromJsonAsync<StockVoucherDetailResponse>())!;
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{Vouchers}/{other.Id}/confirm", null)).StatusCode);
    }

    private async Task<StockVoucherDetailResponse> DraftAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync(Vouchers, new { warehouseId = _warehouse, type = "INBOUND" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<StockVoucherDetailResponse>())!;
    }

    private async Task<(CreateContainerRequest Request, CreateContainerBatchResponse Response)> LinkedAsync(HttpClient client, int? count = null)
    {
        var draft = await DraftAsync(client);
        var request = Request() with { StockVoucherId = draft.Id };
        if (count is { } boxes) request = request with { ContainerCount = boxes, Groups = [new("a", _productA, boxes, 24)] };
        var response = await client.PostAsJsonAsync(Route, request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (request, (await response.Content.ReadFromJsonAsync<CreateContainerBatchResponse>())!);
    }
    private async Task<int> TotalAsync()
    {
        await using var db = Warehouse();
        var inventory = await new WaroTrans.Warehouse.Features.ListInventory.ListInventoryHandler(db)
            .HandleAsync(new WaroTrans.Warehouse.Features.ListInventory.ListInventoryRequest(_warehouse, null, 0, 100), default);
        return inventory.WarehouseContainerCount;
    }
    private async Task<Guid> RackAsync()
    {
        await using var db = Warehouse();
        var id = Guid.NewGuid();
        db.StorageLocations.Add(new StorageLocation { Id = id, WarehouseId = _warehouse, EndpointId = Guid.NewGuid(), Code = "RACK-A", Name = "Rack A", IsActive = true });
        await db.SaveChangesAsync(); return id;
    }
    private sealed class TransportLookup : IContainerTransportLookup
    {
        public HashSet<Guid> Moving { get; } = [];
        public Task<IReadOnlySet<Guid>> GetContainersInActiveTransportAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlySet<Guid>>(ids.Where(Moving.Contains).ToHashSet());
    }
}
