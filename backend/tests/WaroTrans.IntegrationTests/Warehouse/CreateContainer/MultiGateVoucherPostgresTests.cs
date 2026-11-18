using System.Net;
using System.Net.Http.Json;
using FluentValidation;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Services;
using WaroTrans.Transportation.Features.CreateTransportRequest;
using WaroTrans.Transportation.IntegrationEventHandlers;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Transportation.Services;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.ListContainers;
using WaroTrans.Warehouse.Features.ListInventory;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Services;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.IntegrationTests.Warehouse.CreateContainer;

public sealed partial class ContainerBatchPostgresTests
{
    private readonly Guid _inboundWorkflowId = Guid.NewGuid();
    private readonly Guid _outboundWorkflowId = Guid.NewGuid();

    [IsolatedPostgresFact]
    public async Task Two_inbound_and_two_outbound_gates_post_stock_at_voucher_effectiveness_only()
    {
        var inboundA = await AddGateAsync("EP-INBOUND-A");
        var inboundB = await AddGateAsync("EP-INBOUND-B");
        var outboundA = await AddGateAsync("EP-OUTBOUND-A");
        var outboundB = await AddGateAsync("EP-OUTBOUND-B");
        var shelf = await AddLocationAsync("RACK-01");
        // A leftover gate StorageLocation must not make the standard putaway source look like a shelf.
        await AddLocationAsync("LEGACY-RECEIVING", inboundB);

        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var (inbound, batch) = await LinkedAsync(client, 2);
        var inboundPath = $"{Vouchers}/{inbound.StockVoucherId}";
        Assert.All(batch.Items, box =>
        {
            Assert.Equal("CREATED", box.Status);
            Assert.Null(box.CurrentStorageLocationId);
            Assert.Null(box.CurrentEndpointId);
        });

        var blocked = await client.PostAsJsonAsync("/api/transportation/transport-requests",
            Transport(_inboundWorkflowId, batch.Items[0].Id, inboundA, shelf.EndpointId, destination: shelf.Id));
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
        Assert.Contains("inbound_voucher_required", await blocked.Content.ReadAsStringAsync());
        Assert.Equal(0, (await InventoryAsync(client)).WarehouseContainerCount);

        var posted = await ConfirmAsync(client, inboundPath);
        Assert.NotNull(posted.StockPostedAt);
        Assert.All(posted.Lines, line => { Assert.Null(line.CurrentStorageLocationId); Assert.Null(line.CurrentEndpointId); });
        var pending = await InventoryAsync(client);
        Assert.Equal(2, pending.WarehouseContainerCount);
        Assert.Equal(2, pending.UnallocatedContainerCount);
        Assert.Empty(pending.Items);
        Assert.Equal(posted.StockPostedAt, (await ConfirmAsync(client, inboundPath)).StockPostedAt);

        var dockPairs = new[] { (inboundA, outboundA), (inboundB, outboundB) };
        for (var i = 0; i < dockPairs.Length; i++)
        {
            var box = batch.Items[i].Id;
            var (receiveGate, shipGate) = dockPairs[i];
            var putaway = await RequestTransportAsync(client, Transport(_inboundWorkflowId, box, receiveGate,
                shelf.EndpointId, destination: shelf.Id));
            Assert.Null(Assert.Single(putaway.Details).SourceStorageLocationId);
            await HandoverAsync(putaway.Id, box, "ONBOARD", "DELIVERED");

            var shipment = await RequestTransportAsync(client, Transport(_outboundWorkflowId, box,
                shelf.EndpointId, shipGate, source: shelf.Id));
            await HandoverAsync(shipment.Id, box, "ONBOARD");
            Assert.Equal(2, (await InventoryAsync(client)).WarehouseContainerCount);
            await HandoverAsync(shipment.Id, box, "DELIVERED", "DELIVERED");
        }

        var staged = (await client.GetFromJsonAsync<ListContainersResponse>(
            $"/api/warehouse/containers?warehouseId={_warehouse}&eligibleOnly=false&status=STAGED_OUTBOUND"))!.Items;
        Assert.Equal(new Guid?[] { outboundA, outboundB }.Order(), staged.Select(c => c.CurrentEndpointId).Order());
        Assert.All(staged, box => { Assert.Null(box.CurrentStorageLocationId); Assert.False(box.InActiveTransport); });
        var stagedStock = await InventoryAsync(client);
        Assert.Equal(2, stagedStock.WarehouseContainerCount);
        Assert.Equal(0, stagedStock.UnallocatedContainerCount);
        Assert.Equal(2, Assert.Single(stagedStock.Items).ContainerCount);

        var voucher = await OutboundDraftAsync(client);
        var ids = batch.Items.Select(c => c.Id).ToArray();
        var linesPath = $"{Vouchers}/{voucher.Id}/lines";
        var adds = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => client.PostAsJsonAsync(linesPath, new { containerIds = ids })));
        Assert.All(adds, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        var lineSets = await Task.WhenAll(adds.Select(r => r.Content.ReadFromJsonAsync<StockVoucherDetailResponse>()));
        Assert.All(lineSets, lines => Assert.Equal(lineSets[0]!.Lines.Select(l => l.Id), lines!.Lines.Select(l => l.Id)));
        var competing = await OutboundDraftAsync(client);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"{Vouchers}/{competing.Id}/lines", new { containerIds = ids })).StatusCode);

        var confirmations = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => ConfirmAsync(client, $"{Vouchers}/{voucher.Id}")));
        Assert.All(confirmations, receipt =>
        {
            Assert.Equal("CONFIRMED", receipt.Status);
            Assert.Equal(confirmations[0].StockPostedAt, receipt.StockPostedAt);
            Assert.NotNull(receipt.StockPostedAt);
            Assert.All(receipt.Lines, line =>
            {
                Assert.Equal("ISSUED", line.ContainerStatus);
                Assert.Null(line.CurrentEndpointId);
                Assert.Null(line.CurrentStorageLocationId);
            });
        });
        Assert.Equal(0, (await InventoryAsync(client)).WarehouseContainerCount);
        await using var db = Warehouse();
        var issues = await db.ContainerMovements.Where(m => m.Type == ContainerMovementType.ISSUED).ToListAsync();
        Assert.Equal(2, issues.Count);
        Assert.Equal(new Guid?[] { outboundA, outboundB }.Order(), issues.Select(m => m.FromEndpointId).Order());
    }

    [IsolatedPostgresFact]
    public async Task Legacy_shelf_stock_is_retained_when_staging_and_confirm_rechecks_the_gate_and_transport()
    {
        var gate = await AddGateAsync("EP-OUTBOUND-B");
        var shelf = await AddLocationAsync("RACK-01");
        var box = new Container
        {
            Id = Guid.NewGuid(), ProductId = _productA, Barcode = "CTN-LEGACY-STORED", Status = ContainerStatus.STORED,
            CurrentStorageLocationId = shelf.Id, CurrentLevelNo = 1, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
        };
        await using (var db = Warehouse())
        {
            db.Containers.Add(box);
            db.InventoryStocks.Add(new InventoryStock
            {
                Id = Guid.NewGuid(), ProductId = _productA, StorageLocationId = shelf.Id, LevelNo = 1, ContainerCount = 1,
                UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var voucher = await OutboundDraftAsync(client);
        var path = $"{Vouchers}/{voucher.Id}";
        var selection = new { containerIds = new[] { box.Id } };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"{path}/lines", selection)).StatusCode);

        var trip = await RequestTransportAsync(client, Transport(_outboundWorkflowId, box.Id, shelf.EndpointId, gate, source: shelf.Id));
        await HandoverAsync(trip.Id, box.Id, "ONBOARD");
        Assert.Equal(1, (await InventoryAsync(client)).WarehouseContainerCount);
        await HandoverAsync(trip.Id, box.Id, "DELIVERED");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"{path}/lines", selection)).StatusCode);

        _transportLookup.Moving.Add(box.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync($"{path}/confirm", null)).StatusCode);
        _transportLookup.Moving.Clear();

        await using (var nav = Navigation())
        {
            (await nav.Endpoints.FindAsync(gate))!.IsEnabled = false;
            await nav.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{path}/confirm", null)).StatusCode);
        Assert.Equal(1, (await InventoryAsync(client)).WarehouseContainerCount);
        var stillDraft = (await client.GetFromJsonAsync<StockVoucherDetailResponse>(path))!;
        Assert.Null(stillDraft.StockPostedAt);
        Assert.Equal("STAGED_OUTBOUND", Assert.Single(stillDraft.Lines).ContainerStatus);
    }

    private TransportationDbContext Transportation() => new(new DbContextOptionsBuilder<TransportationDbContext>().UseNpgsql(_connection).Options);

    private void RegisterTransport(IServiceCollection services)
    {
        services.AddDbContext<TransportationDbContext>(o => o.UseNpgsql(_connection));
        services.AddScoped<IWarehouseModule, WarehouseModuleApi>();
        services.AddScoped<INavigationModule, NavigationModuleApi>();
        services.AddScoped<IWorkflowRequestValidator>(_ => new GateWorkflowValidator(_inboundWorkflowId));
        services.AddScoped<CreateTransportRequestHandler>();
        services.AddScoped<IValidator<CreateTransportRequestRequest>, CreateTransportRequestValidator>();
    }

    private sealed class GateWorkflowValidator(Guid inboundId) : IWorkflowRequestValidator
    {
        public Task ValidateAsync(Guid workflowId, TransportRequestExecutionSnapshot request, CancellationToken cancellationToken = default)
        {
            WorkflowMovementRules.Ensure(workflowId == inboundId ? WorkflowMovementRules.InboundPutaway : WorkflowMovementRules.OutboundRetrieval, request.Details);
            return Task.CompletedTask;
        }
    }

    private sealed class IgnoreEvents : IIntegrationEventPublisher
    {
        public Task PublishAsync<TEvent>(TEvent integrationEvent, CancellationToken cancellationToken = default) where TEvent : IIntegrationEvent =>
            Task.CompletedTask;
    }

    private async Task HandoverAsync(Guid trip, Guid box, params string[] statuses)
    {
        await using var transportation = Transportation();
        await using var warehouse = Warehouse();
        await using var navigation = Navigation();
        var recorder = new ContainerMovementRecorder(warehouse, NullLogger<ContainerMovementRecorder>.Instance);
        var postings = new StockPostingProcessor(transportation, recorder, NullLogger<StockPostingProcessor>.Instance,
            endpoints: new MapEndpointCatalog(navigation));
        var handler = new JobContainerStatusChangedHandler(transportation, postings, new IgnoreEvents(),
            NullLogger<JobContainerStatusChangedHandler>.Instance);
        foreach (var status in statuses)
            await handler.HandleAsync(new JobContainerStatusChanged(trip, trip, box, status));
        Assert.DoesNotContain(await transportation.StockPostings.Where(p => p.TransportRequestId == trip).ToListAsync(), p => p.PostedAt is null);
    }

    private CreateTransportRequestRequest Transport(Guid workflow, Guid box, Guid sourceGate, Guid targetGate,
        Guid? source = null, Guid? destination = null) =>
        new(_warehouse, _map, workflow, null, null, [new(1, box, source, sourceGate, null, destination, targetGate, null)]);

    private static async Task<CreateTransportRequestResponse> RequestTransportAsync(HttpClient client, CreateTransportRequestRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/transportation/transport-requests", request);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<CreateTransportRequestResponse>())!;
    }

    private async Task<Guid> AddGateAsync(string code)
    {
        await using var nav = Navigation();
        var point = new Endpoint { Id = Guid.NewGuid(), MapVersionId = _map, Code = code, Name = code, EndpointType = EndpointType.WAYPOINT, IsEnabled = true };
        nav.Endpoints.Add(point);
        await nav.SaveChangesAsync();
        return point.Id;
    }

    private async Task<StorageLocation> AddLocationAsync(string code, Guid? endpoint = null)
    {
        var location = new StorageLocation
        {
            Id = Guid.NewGuid(), WarehouseId = _warehouse, EndpointId = endpoint ?? await AddGateAsync($"EP-{code}"),
            Code = code, Name = code, IsActive = true
        };
        await using var db = Warehouse();
        db.StorageLocations.Add(location);
        await db.SaveChangesAsync();
        return location;
    }

    private async Task<ListInventoryResponse> InventoryAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<ListInventoryResponse>($"/api/warehouse/inventory?warehouseId={_warehouse}"))!;

    private static async Task<StockVoucherDetailResponse> ConfirmAsync(HttpClient client, string path)
    {
        var response = await client.PostAsync($"{path}/confirm", null);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<StockVoucherDetailResponse>())!;
    }

    private async Task<StockVoucherDetailResponse> OutboundDraftAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync(Vouchers, new { warehouseId = _warehouse, type = "OUTBOUND" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<StockVoucherDetailResponse>())!;
    }
}
