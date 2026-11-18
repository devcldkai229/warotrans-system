using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.CreateTransportRequest;
using WaroTrans.Transportation.Features.PreviewOutboundPick;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.IntegrationTests.Warehouse.CreateContainer;

public sealed partial class ContainerBatchPostgresTests
{
    private const string TransportPath = "/api/transportation/transport-requests";

    [IsolatedPostgresFact]
    public async Task Fifo_uses_posted_admission_and_skips_reserved_unsettled_and_unverified_legacy_stock()
    {
        var shelf = await AddLocationAsync("RACK-FIFO");
        var gate = await AddGateAsync("EP-OUTBOUND-FIFO");
        var time = DateTimeOffset.UtcNow.AddDays(-10);
        var allocated = await PlaceFifoStockAsync(shelf, "CTN-RESERVED", time.AddDays(1), time.AddDays(1), posted: true);
        var oldest = await PlaceFifoStockAsync(shelf, "CTN-OLDEST", time.AddDays(8), time.AddDays(2), posted: true);
        var newer = await PlaceFifoStockAsync(shelf, "CTN-NEWER", time, time.AddDays(3), posted: true);
        var legacy = await PlaceFifoStockAsync(shelf, "CTN-LEGACY-RECORDED", time, time.AddDays(4), posted: false);
        var reconciling = await PlaceFifoStockAsync(shelf, "CTN-RECONCILING", time, time, posted: true);
        await PlaceFifoStockAsync(shelf, "CTN-LEGACY-UNKNOWN", time, null, posted: false);
        await PlaceFifoStockAsync(shelf, "CTN-OTHER-PRODUCT", time, time, posted: true, product: _productB);

        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        await RequestTransportAsync(client, Transport(_outboundWorkflowId, allocated, shelf.EndpointId, gate, source: shelf.Id));
        var prior = await RequestTransportAsync(client, Transport(_outboundWorkflowId, reconciling, shelf.EndpointId, gate, source: shelf.Id));
        await using (var transport = Transportation())
        {
            var detail = await transport.TransportRequestDetails.SingleAsync(d => d.TransportRequestId == prior.Id);
            detail.Status = TransportRequestDetailStatus.COMPLETED;
            transport.StockPostings.Add(new StockPosting
            {
                Id = Guid.NewGuid(), Key = "pending-fifo-check", Type = StockPostingType.DELIVERY,
                ContainerId = reconciling, JobId = Guid.NewGuid(), TransportRequestId = prior.Id, CreatedAt = time,
            });
            await transport.SaveChangesAsync();
        }

        var invalidGate = await client.PostAsJsonAsync($"{TransportPath}/outbound-pick-preview",
            new OutboundPickRequest(_warehouse, _map, _productA, 1, shelf.EndpointId));
        Assert.Equal(HttpStatusCode.BadRequest, invalidGate.StatusCode);

        var preview = await PreviewAsync(client, gate, 4);
        Assert.False(preview.IsComplete);
        Assert.Equal(new[] { oldest, newer, legacy }, preview.Items.Select(p => p.Detail.ContainerId));
        Assert.All(preview.Items, item =>
        {
            Assert.Equal(shelf.Id, item.Detail.SourceStorageLocationId);
            Assert.Equal(gate, item.Detail.DestinationEndpointId);
            Assert.Null(item.Detail.DestinationStorageLocationId);
        });
        await using var check = Transportation();
        Assert.Equal(2, await check.TransportRequests.CountAsync());
    }

    [IsolatedPostgresFact]
    public async Task Concurrent_submissions_keep_the_reviewed_pick_and_never_substitute_available_stock()
    {
        var shelf = await AddLocationAsync("RACK-FIFO");
        var gate = await AddGateAsync("EP-OUTBOUND-FIFO");
        var time = DateTimeOffset.UtcNow.AddDays(-10);
        var oldest = await PlaceFifoStockAsync(shelf, "CTN-FIRST", time, time, posted: true);
        var second = await PlaceFifoStockAsync(shelf, "CTN-SECOND", time, time.AddDays(1), posted: true);

        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var preview = await PreviewAsync(client, gate, 1);
        Assert.True(preview.IsComplete);
        var detail = Assert.Single(preview.Items).Detail;
        Assert.Equal(oldest, detail.ContainerId);
        var body = new CreateTransportRequestRequest(_warehouse, _map, _outboundWorkflowId,
            null, null, [detail], OutboundFifo: new(_productA, 1));

        var tampered = await client.PostAsJsonAsync(TransportPath, body with { Details = [detail with { ContainerId = second }] });
        Assert.Equal(HttpStatusCode.Conflict, tampered.StatusCode);

        var outcomes = await Task.WhenAll(client.PostAsJsonAsync(TransportPath, body),
            client.PostAsJsonAsync(TransportPath, body));
        var created = Assert.Single(outcomes, r => r.StatusCode == HttpStatusCode.Created);
        var conflict = Assert.Single(outcomes, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Contains("outbound_fifo_selection_changed", await conflict.Content.ReadAsStringAsync());
        var manualConflict = await client.PostAsJsonAsync(TransportPath, body with { OutboundFifo = null });
        Assert.Equal(HttpStatusCode.Conflict, manualConflict.StatusCode);
        Assert.Contains("container_already_requested", await manualConflict.Content.ReadAsStringAsync());
        var receipt = (await created.Content.ReadFromJsonAsync<CreateTransportRequestResponse>())!;
        Assert.Equal(oldest, Assert.Single(receipt.Details).ContainerId);
        Assert.Equal(second, Assert.Single((await PreviewAsync(client, gate, 1)).Items).Detail.ContainerId);

        var stale = await client.PostAsJsonAsync(TransportPath, body);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains("outbound_fifo_selection_changed", await stale.Content.ReadAsStringAsync());

        await HandoverAsync(receipt.Id, oldest, "ONBOARD", "DELIVERED");
        var draft = await OutboundDraftAsync(client);
        var add = await client.PostAsJsonAsync($"{Vouchers}/{draft.Id}/lines", new { containerIds = new[] { oldest } });
        Assert.Equal(HttpStatusCode.OK, add.StatusCode);
        await ConfirmAsync(client, $"{Vouchers}/{draft.Id}");
        Assert.Equal(1, (await InventoryAsync(client)).WarehouseContainerCount);
        await using var check = Transportation();
        Assert.Equal(1, await check.TransportRequests.CountAsync());
    }

    private async Task<OutboundPickResponse> PreviewAsync(HttpClient client, Guid gate, int count)
    {
        var response = await client.PostAsJsonAsync($"{TransportPath}/outbound-pick-preview",
            new OutboundPickRequest(_warehouse, _map, _productA, count, gate));
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<OutboundPickResponse>())!;
    }

    private async Task<Guid> PlaceFifoStockAsync(StorageLocation shelf, string barcode, DateTimeOffset created,
        DateTimeOffset? admission, bool posted, Guid? product = null)
    {
        await using var db = Warehouse();
        var productId = product ?? _productA;
        var box = new Container
        {
            Id = Guid.NewGuid(), ProductId = productId, Barcode = barcode, CreatedAt = created, UpdatedAt = created,
            Status = ContainerStatus.STORED, CurrentStorageLocationId = shelf.Id, CurrentLevelNo = 1
        };
        if (posted && admission is { } at)
        {
            var actor = new TestActor().AccountId!.Value;
            var voucher = StockVoucher.Create($"PN-{barcode}", StockVoucherType.INBOUND, _warehouse, null, null, actor, at);
            box.Status = ContainerStatus.CREATED;
            voucher.AddLine(box, at);
            voucher.Confirm(actor, at);
            voucher.StockPostedAt = at;
            box.Status = ContainerStatus.STORED;
            box.WarehouseId = _warehouse;
            box.InboundStockVoucherId = voucher.Id;
            box.InventoryStorageLocationId = shelf.Id;
            box.InventoryLevelNo = 1;
            db.StockVouchers.Add(voucher);
        }
        else if (admission is { } received)
        {
            db.ContainerMovements.Add(new ContainerMovement
            {
                Id = Guid.NewGuid(), ContainerId = box.Id, Type = ContainerMovementType.DELIVERED,
                ToStorageLocationId = shelf.Id, ToStatus = ContainerStatus.STORED,
                OccurredAt = received, IdempotencyKey = $"fifo-{barcode}"
            });
        }
        db.Containers.Add(box);
        var stock = await db.InventoryStocks.SingleOrDefaultAsync(s => s.ProductId == productId && s.StorageLocationId == shelf.Id);
        if (stock is null)
        {
            stock = new InventoryStock { Id = Guid.NewGuid(), ProductId = productId, StorageLocationId = shelf.Id, LevelNo = 1, UpdatedAt = created };
            db.InventoryStocks.Add(stock);
        }
        stock.ContainerCount++;
        await db.SaveChangesAsync();
        return box.Id;
    }
}
