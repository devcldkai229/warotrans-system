using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Seeding;

namespace WaroTrans.IntegrationTests.Transportation.CreateTransportRequest;

/// <summary>
/// Transport Requests on the seeded OUTBOUND_RETRIEVAL / INTERNAL_RELOCATION workflows, through the API: what each
/// accepts, what it refuses, and the Job the queue makes for several Containers.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class StandardWorkflowRequestRulesTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Route = "/api/transportation/transport-requests";
    private static readonly Guid TestAccountId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private sealed record IdDto(Guid Id);

    private sealed record QueuedJobDto(Guid JobId, int JobContainerCount);

    private sealed record QueueDto(string Status, List<QueuedJobDto> Jobs);

    /// <summary>Shelves A and B (storage locations), outbound point O and dock D (no shelf). C1, C2 on shelf A, C3 on shelf B.</summary>
    private sealed record Floor(Guid WarehouseId, Guid MapVersionId, Guid ShelfA, Guid ShelfB, Guid Outbound, Guid Dock, Guid[] Containers);

    [Fact]
    public async Task Outbound_of_two_containers_from_two_shelves_runs_through_the_published_steps()
    {
        var floor = await SeedFloorAsync();
        var workflows = await SeedWorkflowsAsync();

        var created = await Client.PostAsJsonAsync(Route, Body(floor, workflows["OUTBOUND_RETRIEVAL"],
            Detail(1, floor.Containers[0], floor.ShelfA, floor.Outbound),
            Detail(2, floor.Containers[2], floor.ShelfB, floor.Outbound)));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var requestId = (await created.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;

        var queued = await Client.PostAsync($"{Route}/{requestId}/queue", null);
        Assert.Equal(HttpStatusCode.OK, queued.StatusCode);
        var jobs = (await queued.Content.ReadFromJsonAsync<QueueDto>(JsonOptions))!.Jobs;

        // One robot carries up to 3: one trip collects at both shelves, then drops both at the outbound point.
        var job = Assert.Single(jobs);
        Assert.Equal(2, job.JobContainerCount);
        Assert.Equal(
            ["MOVE_TO_PICKUP", "CONFIRM_PICKUP", "MOVE_TO_PICKUP", "CONFIRM_PICKUP", "MOVE_TO_DROPOFF", "CONFIRM_DROPOFF", "CONFIRM_DROPOFF"],
            await StepKeysAsync(job.JobId));
    }

    [Fact]
    public async Task Internal_relocation_between_two_shelves_is_accepted()
    {
        var floor = await SeedFloorAsync();
        var workflows = await SeedWorkflowsAsync();

        var response = await Client.PostAsJsonAsync(Route, Body(floor, workflows["INTERNAL_RELOCATION"],
            Detail(1, floor.Containers[0], floor.ShelfA, floor.ShelfB),
            Detail(2, floor.Containers[2], floor.ShelfB, floor.ShelfA)));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Theory]
    [InlineData("OUTBOUND_RETRIEVAL", 0, "A", "B", "outbound_destination_is_storage")]
    [InlineData("INTERNAL_RELOCATION", 0, "A", "O", "relocation_requires_storage_locations")]
    [InlineData("INTERNAL_RELOCATION", 2, "A", "B", "container_not_at_source")]
    [InlineData("OUTBOUND_RETRIEVAL", 2, "A", "O", "container_not_at_source")]
    [InlineData("INTERNAL_RELOCATION", 0, "A", "A", "detail_same_endpoint")]
    public async Task Requests_that_do_not_fit_the_workflow_are_refused_and_nothing_is_stored(
        string workflowCode, int containerIndex, string from, string to, string expectedCode)
    {
        var floor = await SeedFloorAsync();
        var workflows = await SeedWorkflowsAsync();

        var response = await Client.PostAsJsonAsync(Route, Body(floor, workflows[workflowCode],
            Detail(1, floor.Containers[containerIndex], Point(floor, from), Point(floor, to))));

        Assert.False(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expectedCode, problem.RootElement.GetProperty("code").GetString());
        await using var scope = Factory.Services.CreateAsyncScope();
        Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<TransportationDbContext>().TransportRequests.CountAsync());
    }

    [Fact]
    public async Task Inbound_of_a_received_container_onto_a_shelf_is_accepted()
    {
        var floor = await SeedFloorAsync(unshelvedContainer: true, inboundVoucher: true);
        var workflows = await SeedWorkflowsAsync();

        var response = await Client.PostAsJsonAsync(Route, Body(floor, workflows["INBOUND"],
            Detail(1, floor.Containers[3], floor.Dock, floor.ShelfA)));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Theory]
    [InlineData(3, "D", "O", true, "inbound_destination_not_storage")]   // inbound goes onto a shelf
    [InlineData(3, "D", "A", false, "inbound_voucher_required")]         // no confirmed phiếu nhập
    [InlineData(0, "D", "B", true, "container_already_stored")]          // already on shelf A
    [InlineData(3, "A", "B", true, "container_not_stored")]              // not on a shelf: cannot be collected from one
    public async Task Inbound_requests_that_do_not_fit_are_refused(
        int containerIndex, string from, string to, bool inboundVoucher, string expectedCode)
    {
        var floor = await SeedFloorAsync(unshelvedContainer: true, inboundVoucher: inboundVoucher);
        var workflows = await SeedWorkflowsAsync();

        var response = await Client.PostAsJsonAsync(Route, Body(floor, workflows["INBOUND"],
            Detail(1, floor.Containers[containerIndex], Point(floor, from), Point(floor, to))));

        Assert.False(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expectedCode, problem.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Outbound_from_a_point_that_is_not_a_shelf_is_refused()
    {
        var floor = await SeedFloorAsync(unshelvedContainer: true);
        var workflows = await SeedWorkflowsAsync();

        var response = await Client.PostAsJsonAsync(Route, Body(floor, workflows["OUTBOUND_RETRIEVAL"],
            Detail(1, floor.Containers[3], floor.Dock, floor.Outbound)));

        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("outbound_source_not_storage", problem.RootElement.GetProperty("code").GetString());
    }

    private static Guid Point(Floor floor, string name) => name switch
    {
        "A" => floor.ShelfA,
        "B" => floor.ShelfB,
        "D" => floor.Dock,
        _ => floor.Outbound
    };

    private async Task<Dictionary<string, Guid>> SeedWorkflowsAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var outcomes = await scope.ServiceProvider.GetRequiredService<StandardWorkflowSeeder>().SeedAsync(false, CancellationToken.None);
        Assert.All(outcomes, o => Assert.Equal(WorkflowStatus.PUBLISHED, o.Status));
        return outcomes.ToDictionary(o => o.Code, o => o.WorkflowId);
    }

    private async Task<List<string>> StepKeysAsync(Guid jobId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        return await db.JobSteps
            .Where(s => s.JobTask.JobId == jobId)
            .OrderBy(s => s.JobTask.SequenceNo).ThenBy(s => s.SequenceNo)
            .Join(db.WorkflowSteps, s => s.WorkflowStepId, w => w.Id, (_, w) => w.StepKey)
            .ToListAsync();
    }

    private static object Body(Floor floor, Guid workflowId, params object[] details) => new
    {
        warehouseId = floor.WarehouseId,
        mapVersionId = floor.MapVersionId,
        workflowId,
        workflowInputs = new Dictionary<string, object>(),
        details
    };

    private static object Detail(int sequenceNo, Guid containerId, Guid source, Guid destination) => new
    {
        sequenceNo,
        containerId,
        sourceEndpointId = source,
        destinationEndpointId = destination
    };

    private async Task<Floor> SeedFloorAsync(bool unshelvedContainer = false, bool inboundVoucher = false)
    {
        var warehouseId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        await using (var first = Factory.Services.CreateAsyncScope())
        {
            var warehouses = first.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            warehouses.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
            {
                Id = warehouseId, Code = "WH-WF", Name = "WF warehouse", Timezone = "Asia/Ho_Chi_Minh", IsActive = true, CreatedAt = now
            });
            await warehouses.SaveChangesAsync();
        }

        var mapResponse = await Client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Map", mapUri = "http://storage/map.yaml", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        mapResponse.EnsureSuccessStatusCode();
        var mapId = (await mapResponse.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
        var shelfA = await CreateEndpointAsync(mapId, "Shelf A", 1.0);
        var shelfB = await CreateEndpointAsync(mapId, "Shelf B", 2.0);
        var outbound = await CreateEndpointAsync(mapId, "Outbound", 3.0);
        var dock = await CreateEndpointAsync(mapId, "Dock", 4.0);
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        var containers = new List<Guid>();
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = "CAT-WF", Name = "WF" };
        var product = new Product
        {
            Id = Guid.NewGuid(), CategoryId = category.Id, Sku = "SKU-WF-1", Name = "WF product", IsActive = true, CreatedAt = now, UpdatedAt = now
        };
        var slA = new StorageLocation { Id = Guid.NewGuid(), WarehouseId = warehouseId, EndpointId = shelfA, Code = "SL-A", Name = "Shelf A", IsActive = true, CreatedAt = now };
        var slB = new StorageLocation { Id = Guid.NewGuid(), WarehouseId = warehouseId, EndpointId = shelfB, Code = "SL-B", Name = "Shelf B", IsActive = true, CreatedAt = now };
        db.ProductCategories.Add(category);
        db.Products.Add(product);
        db.StorageLocations.AddRange(slA, slB);

        var stored = new[] { slA.Id, slA.Id, slB.Id };
        var outboundVoucher = StockVoucher.Create("PX-WF-000001", StockVoucherType.OUTBOUND, warehouseId, null, null, TestAccountId, now);
        for (var i = 0; i < stored.Length; i++)
        {
            var container = new Container
            {
                Id = Guid.NewGuid(), ProductId = product.Id, Product = product, Barcode = $"CTN-WF-{i + 1}", Status = ContainerStatus.STORED,
                CurrentStorageLocationId = stored[i], CreatedBy = TestAccountId, CreatedAt = now, UpdatedAt = now
            };
            db.Containers.Add(container);
            outboundVoucher.AddLine(container, now);
            containers.Add(container.Id);
        }

        if (unshelvedContainer)
        {
            var loose = new Container
            {
                Id = Guid.NewGuid(), ProductId = product.Id, Barcode = "CTN-WF-LOOSE", Status = ContainerStatus.PACKED,
                CreatedBy = TestAccountId, CreatedAt = now, UpdatedAt = now
            };
            db.Containers.Add(loose);
            containers.Add(loose.Id);
            if (inboundVoucher)
            {
                var receipt = StockVoucher.Create("PN-WF-000001", StockVoucherType.INBOUND, warehouseId, null, null, TestAccountId, now);
                receipt.AddLine(loose, now);
                receipt.Confirm(TestAccountId, now);
                db.StockVouchers.Add(receipt);
            }
        }

        outboundVoucher.Confirm(TestAccountId, now);
        db.StockVouchers.Add(outboundVoucher);
        await db.SaveChangesAsync();

        return new Floor(warehouseId, mapId, shelfA, shelfB, outbound, dock, [.. containers]);
    }

    private async Task<Guid> CreateEndpointAsync(Guid mapId, string name, double x)
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", new
        {
            name, endpointType = "WAYPOINT", x, y = 1.0, yaw = 0.0, positionTolerance = 0.1, yawTolerance = 0.2
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
    }
}
