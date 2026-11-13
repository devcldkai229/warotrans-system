using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.UnitTests.Warehouse.Features.CreateContainer;

public class CreateContainerBatchTests
{
    [Fact]
    public async Task Creates_mixed_product_batch_with_exact_mapping_contents_and_no_stock_or_voucher()
    {
        using var fixture = await Fixture.CreateAsync();
        var response = await fixture.Handler.HandleAsync(fixture.Request);
        Assert.False(response.Replayed);
        Assert.Equal(10, response.ContainerCount);
        Assert.Equal(10, response.Items.Select(item => item.Barcode).Distinct().Count());
        Assert.Equal(6, response.Items.Count(item => item.GroupKey == "group-1" && item.ProductId == fixture.A.Id));
        Assert.Equal(4, response.Items.Count(item => item.GroupKey == "group-2" && item.ProductId == fixture.B.Id));
        Assert.Equal(18m, response.Items.Single(item => item.GroupKey == "group-1" && item.ContainerNo == 2).ContentsQuantity);
        Assert.All(response.Items, item => { Assert.Equal("CREATED", item.Status); Assert.Equal("pcs", item.ContentsUnit); Assert.Equal(fixture.Location.Id, item.CurrentStorageLocationId); Assert.Equal(fixture.Location.EndpointId, item.CurrentEndpointId); });
        Assert.Empty(await fixture.Db.InventoryStocks.ToListAsync());
        Assert.Empty(await fixture.Db.StockVouchers.ToListAsync());
        Assert.Equal(1, fixture.Codes.ContainerBatchCalls);
        var details = await new WaroTrans.Warehouse.Features.GetContainer.GetContainerHandler(fixture.Db).GetByIdAsync(response.Items[1].Id);
        Assert.Equal(18m, details.ContentsQuantity);
        Assert.Equal(fixture.Request.RequestId, details.CreationRequestId);
    }

    [Fact]
    public async Task One_box_uses_the_same_batch_contract_and_legacy_request_still_creates_one_box()
    {
        using var f = await Fixture.CreateAsync();
        var request = f.Request with { ContainerCount = 1, Groups = [new("one", f.A.Id, 1, 2.5m, "kg")] };
        var receipt = await f.Handler.HandleAsync(request);
        Assert.Single(receipt.Items);
        Assert.Equal(2.5m, receipt.Items[0].ContentsQuantity);
        var legacy = new CreateContainerHandler(f.Db, f.Codes, f.User, new CreateContainerValidator(), NullLogger<CreateContainerHandler>.Instance);
        var single = await legacy.HandleAsync(new CreateContainerRequest(f.A.Id));
        Assert.Equal(f.A.Id, single.ProductId);
        Assert.Null((await f.Db.Containers.FindAsync(single.Id))!.ContentsQuantity);
    }

    [Fact]
    public async Task Replay_keeps_the_same_ids_without_generating_codes_even_after_product_or_location_changes()
    {
        using var f = await Fixture.CreateAsync();
        var first = await f.Handler.HandleAsync(f.Request);
        f.A.IsActive = false;
        var row = await f.Db.Containers.FindAsync(first.Items[0].Id);
        row!.Status = ContainerStatus.IN_TRANSIT; row.CurrentStorageLocationId = null;
        await f.Db.SaveChangesAsync();
        f.Options.InboundStorageLocations.Clear();
        var replay = await f.Handler.HandleAsync(f.Request);
        Assert.True(replay.Replayed);
        Assert.Equal(first.Items.Select(i => (i.Id, i.Barcode)), replay.Items.Select(i => (i.Id, i.Barcode)));
        Assert.Equal("IN_TRANSIT", replay.Items[0].Status);
        Assert.Null(replay.Items[0].CurrentStorageLocationId);
        Assert.Equal(1, f.Codes.ContainerBatchCalls);
        Assert.Equal(10, await f.Db.Containers.CountAsync());
    }

    [Fact]
    public async Task Effective_decimal_values_and_override_order_are_canonical_for_retry()
    {
        using var f = await Fixture.CreateAsync();
        var groups = f.Request.Groups!.ToArray();
        groups[0] = groups[0]! with { QuantityOverrides = [new(2, 18m), new(3, 19m)] };
        var request = f.Request with { Groups = groups };
        await f.Handler.HandleAsync(request);
        groups = groups.ToArray();
        groups[0] = groups[0]! with { QuantityPerContainer = 24.000m, QuantityOverrides = [new(3, 19.00m), new(2, 18.0m)] };
        Assert.True((await f.Handler.HandleAsync(request with { Groups = groups })).Replayed);
    }

    [Fact]
    public async Task Reusing_request_for_different_payload_or_actor_is_a_conflict_without_new_containers()
    {
        using var f = await Fixture.CreateAsync();
        await f.Handler.HandleAsync(f.Request);
        var groups = f.Request.Groups!.ToArray(); groups[0] = groups[0]! with { QuantityPerContainer = 25 };
        var error = await Assert.ThrowsAsync<ConflictException>(() => f.Handler.HandleAsync(f.Request with { Groups = groups }));
        Assert.Equal("container_creation_request_conflict", error.Code);
        f.User.AccountId = Guid.NewGuid();
        await Assert.ThrowsAsync<ConflictException>(() => f.Handler.HandleAsync(f.Request));
        Assert.Equal(10, await f.Db.Containers.CountAsync());
        Assert.Equal(1, f.Codes.ContainerBatchCalls);
    }

    [Fact]
    public async Task Missing_receipt_row_does_not_silently_create_the_missing_box_on_retry()
    {
        using var f = await Fixture.CreateAsync();
        await f.Handler.HandleAsync(f.Request);
        f.Db.Containers.Remove(await f.Db.Containers.FirstAsync()); await f.Db.SaveChangesAsync();
        var error = await Assert.ThrowsAsync<ConflictException>(() => f.Handler.HandleAsync(f.Request));
        Assert.Equal("container_creation_receipt_incomplete", error.Code);
        Assert.Equal(9, await f.Db.Containers.CountAsync());
    }

    [Fact]
    public async Task An_inactive_last_product_fails_the_whole_batch_before_codes_or_records_are_created()
    {
        using var f = await Fixture.CreateAsync();
        f.B.IsActive = false; await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<NotFoundException>(() => f.Handler.HandleAsync(f.Request));
        Assert.Equal(0, f.Codes.ContainerBatchCalls);
        Assert.Empty(await f.Db.Containers.ToListAsync());
    }

    [Theory]
    [InlineData("missing-config")]
    [InlineData("inactive-location")]
    [InlineData("wrong-warehouse")]
    [InlineData("disabled-endpoint")]
    [InlineData("wrong-map")]
    [InlineData("draft-map")]
    [InlineData("parking-point")]
    [InlineData("requested-shelf")]
    public async Task Receiving_location_must_be_server_configured_active_and_on_the_active_published_map(string scenario)
    {
        using var f = await Fixture.CreateAsync();
        var request = f.Request;
        switch (scenario)
        {
            case "missing-config": f.Options.InboundStorageLocations.Clear(); break;
            case "inactive-location": f.Location.IsActive = false; break;
            case "wrong-warehouse": f.Location.WarehouseId = Guid.NewGuid(); break;
            case "disabled-endpoint": f.Navigation.Endpoint = f.Navigation.Endpoint with { IsEnabled = false }; break;
            case "wrong-map": f.Navigation.Endpoint = f.Navigation.Endpoint with { MapVersionId = Guid.NewGuid() }; break;
            case "draft-map": f.Navigation.Map = f.Navigation.Map with { Status = MapStatus.DRAFT }; break;
            case "parking-point": f.Navigation.Endpoint = f.Navigation.Endpoint with { EndpointType = "PARK" }; break;
            case "requested-shelf": request = request with { InitialStorageLocationId = Guid.NewGuid() }; break;
        }
        await f.Db.SaveChangesAsync();
        await Assert.ThrowsAnyAsync<AppException>(() => f.Handler.HandleAsync(request));
        Assert.Empty(await f.Db.Containers.ToListAsync());
        Assert.Equal(0, f.Codes.ContainerBatchCalls);
    }

    [Fact]
    public async Task Handler_rejects_an_actor_without_create_permission()
    {
        using var f = await Fixture.CreateAsync(); f.User.Role = "TECHNICIAN";
        var error = await Assert.ThrowsAsync<AppException>(() => f.Handler.HandleAsync(f.Request));
        Assert.Equal(403, error.StatusCode);
        Assert.Empty(await f.Db.Containers.ToListAsync());
    }

    [Fact]
    public void Server_receiving_dictionary_binds_warehouse_and_location_guids()
    {
        var warehouse = Guid.NewGuid(); var location = Guid.NewGuid();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { [$"WarehouseReceiving:InboundStorageLocations:{warehouse}"] = location.ToString() }).Build();
        var options = config.GetSection(ReceivingOptions.SectionName).Get<ReceivingOptions>()!;
        Assert.Equal(location, options.InboundStorageLocations[warehouse.ToString()]);
    }

    [Fact]
    public async Task Validator_rejects_incomplete_ambiguous_or_mismatched_batch_requests()
    {
        using var f = await Fixture.CreateAsync(); var validator = new CreateContainerValidator();
        var invalid = new[]
        {
            f.Request with { ProductId = f.A.Id }, f.Request with { RequestId = null }, f.Request with { WarehouseId = null },
            f.Request with { ContainerCount = 11 }, f.Request with { ContainerCount = 0 }, f.Request with { Groups = [] },
            f.Request with { StockVoucherId = Guid.NewGuid() }, f.Request with { InitialLevelNo = 1 },
            f.Request with { Groups = [null] }, f.Request with { Groups = [new("x", f.A.Id, 10, 0, "pcs")] },
            f.Request with { Groups = [new("x", f.A.Id, 10, 1.0001m, "pcs")] },
            f.Request with { Groups = [new("x", f.A.Id, 10, 1, " ")] },
            f.Request with { Groups = [new("x", f.A.Id, 10, 1, "pcs", [new(11, 1)])] },
            f.Request with { Groups = [new("x", f.A.Id, 10, 1, "pcs", [new(1, 1), new(1, 2)])] },
            f.Request with { Groups = [new("x", f.A.Id, 5, 1, "pcs"), new(" x ", f.B.Id, 5, 1, "pcs")] },
        };
        foreach (var request in invalid) Assert.False((await validator.ValidateAsync(request)).IsValid);
        Assert.True((await validator.ValidateAsync(f.Request)).IsValid);
    }

    private sealed class Fixture : IDisposable
    {
        public WarehouseDbContext Db { get; } = WarehouseTestDbContextFactory.Create(Guid.NewGuid().ToString());
        public Product A { get; } = new() { Id = Guid.NewGuid(), Name = "A", Sku = "A", IsActive = true, SupplierBarcode = "supplier-a" };
        public Product B { get; } = new() { Id = Guid.NewGuid(), Name = "B", Sku = "B", IsActive = true };
        public StorageLocation Location { get; } = new() { Id = Guid.NewGuid(), EndpointId = Guid.NewGuid(), IsActive = true, Code = "Receiving" };
        public FakeCurrentUser User { get; } = new(role: "STAFF");
        public FakeBusinessCodeGenerator Codes { get; } = new();
        public ReceivingOptions Options { get; } = new();
        public ReceivingNavigation Navigation { get; private set; } = null!;
        public CreateContainerBatchHandler Handler { get; private set; } = null!;
        public CreateContainerRequest Request { get; private set; } = null!;
        public static async Task<Fixture> CreateAsync()
        {
            var f = new Fixture(); var warehouse = new WaroTrans.Warehouse.Entities.Warehouse { Id = Guid.NewGuid(), IsActive = true, Name = "Warehouse", Code = "WH" };
            f.Location.WarehouseId = warehouse.Id;
            f.Db.Warehouses.Add(warehouse); f.Db.StorageLocations.Add(f.Location); f.Db.Products.AddRange(f.A, f.B); await f.Db.SaveChangesAsync();
            f.Options.InboundStorageLocations[warehouse.Id.ToString()] = f.Location.Id;
            f.Navigation = new(warehouse.Id, f.Location.EndpointId);
            f.Handler = new(f.Db, f.Codes, f.User, new CreateContainerValidator(), f.Navigation, Microsoft.Extensions.Options.Options.Create(f.Options), NullLogger<CreateContainerBatchHandler>.Instance);
            f.Request = new(WarehouseId: warehouse.Id, RequestId: Guid.NewGuid(), ContainerCount: 10, Groups:
                [new("group-1", f.A.Id, 6, 24, " pcs ", [new(2, 18)]), new("group-2", f.B.Id, 4, 12, "pcs")]);
            return f;
        }
        public void Dispose() => Db.Dispose();
    }

    private sealed class ReceivingNavigation : IMapEndpointCatalog
    {
        public MapVersionSnapshot Map { get; set; }
        public MapEndpointSnapshot Endpoint { get; set; }
        public ReceivingNavigation(Guid warehouseId, Guid endpointId)
        {
            Map = new(Guid.NewGuid(), warehouseId, 1, MapStatus.PUBLISHED);
            // The code intentionally has no INBOUND substring: configuration, not a naming heuristic, owns its role.
            Endpoint = new(endpointId, Map.Id, "EP-DOCK", "Receiving", "WAYPOINT", true);
        }
        public Task<IReadOnlyList<MapEndpointSnapshot>> GetPublishedEndpointsAsync(Guid warehouseId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<MapEndpointSnapshot>>(Map.WarehouseId == warehouseId && Map.Status == MapStatus.PUBLISHED && Endpoint.MapVersionId == Map.Id ? [Endpoint] : []);
        public Task<IReadOnlyList<MapEndpointSnapshot>> GetEndpointsAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<MapEndpointSnapshot>>(ids.Contains(Endpoint.Id) ? [Endpoint] : []);
    }
}
