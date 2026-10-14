using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.CreateTransportRequest;
using WaroTrans.UnitTests.Transportation.Infrastructure;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.UnitTests.Transportation.Features.CreateTransportRequest;

public sealed class CreateTransportRequestHandlerTests
{
    private static readonly Guid WarehouseId = Guid.NewGuid();
    private static readonly Guid MapVersionId = Guid.NewGuid();
    private static readonly Guid OtherMapVersionId = Guid.NewGuid();
    private static readonly Guid WorkflowId = Guid.NewGuid();

    private static readonly Guid EndpointA = Guid.NewGuid();
    private static readonly Guid EndpointD = Guid.NewGuid();
    private static readonly Guid EndpointE = Guid.NewGuid();
    private static readonly Guid EndpointF = Guid.NewGuid();
    private static readonly Guid EndpointOnOtherMap = Guid.NewGuid();
    private static readonly Guid DisabledEndpoint = Guid.NewGuid();

    private static readonly Guid C1 = Guid.NewGuid();
    private static readonly Guid C2 = Guid.NewGuid();
    private static readonly Guid C3 = Guid.NewGuid();
    private static readonly Guid ReservedContainer = Guid.NewGuid();

    private readonly string _dbName = $"transportation-{Guid.NewGuid()}";
    private readonly FakeWarehouseModule _warehouse = new();
    private readonly FakeNavigationModule _navigation = new();
    private readonly RecordingWorkflowRequestValidator _workflowValidator = new();
    private readonly FakeCurrentUser _currentUser = new(Guid.NewGuid());

    public CreateTransportRequestHandlerTests()
    {
        _warehouse.Warehouses[WarehouseId] = new WarehouseSnapshot(WarehouseId, "WH-001", true);
        _warehouse.Containers[C1] = new ContainerSnapshot(C1, "CTN-1", ContainerStatus.STORED, null, null);
        _warehouse.Containers[C2] = new ContainerSnapshot(C2, "CTN-2", ContainerStatus.STORED, null, null);
        _warehouse.Containers[C3] = new ContainerSnapshot(C3, "CTN-3", ContainerStatus.PACKED, null, null);
        _warehouse.Containers[ReservedContainer] = new ContainerSnapshot(ReservedContainer, "CTN-R", ContainerStatus.RESERVED, null, null);

        _navigation.MapVersions[MapVersionId] = new MapVersionSnapshot(MapVersionId, WarehouseId, 1, MapStatus.PUBLISHED);
        _navigation.MapVersions[OtherMapVersionId] = new MapVersionSnapshot(OtherMapVersionId, WarehouseId, 2, MapStatus.DRAFT);
        AddEndpoint(EndpointA, MapVersionId, "EP-A");
        AddEndpoint(EndpointD, MapVersionId, "EP-D");
        AddEndpoint(EndpointE, MapVersionId, "EP-E");
        AddEndpoint(EndpointF, MapVersionId, "EP-F");
        AddEndpoint(EndpointOnOtherMap, OtherMapVersionId, "EP-X");
        AddEndpoint(DisabledEndpoint, MapVersionId, "EP-OFF", isEnabled: false);
    }

    private void AddEndpoint(Guid id, Guid mapVersionId, string code, bool isEnabled = true) =>
        _navigation.Endpoints[id] = new EndpointSnapshot(id, mapVersionId, code, code, EndpointType.STORAGE, isEnabled);

    private CreateTransportRequestHandler CreateHandler(out Persistence db)
    {
        var context = TransportationTestDbContextFactory.Create(_dbName);
        db = new Persistence(_dbName);
        return new CreateTransportRequestHandler(
            context,
            _warehouse,
            _navigation,
            _workflowValidator,
            new FakeBusinessCodeGenerator(),
            _currentUser,
            new CreateTransportRequestValidator(),
            NullLogger<CreateTransportRequestHandler>.Instance);
    }

    /// <summary>Reads what was actually persisted, through a fresh DbContext.</summary>
    private sealed class Persistence(string dbName)
    {
        public int RequestCount() => TransportationTestDbContextFactory.Create(dbName).TransportRequests.Count();
        public int DetailCount() => TransportationTestDbContextFactory.Create(dbName).TransportRequestDetails.Count();

        public WaroTrans.Transportation.Entities.TransportRequest Load(Guid id) =>
            TransportationTestDbContextFactory.Create(dbName).TransportRequests
                .Include(r => r.Details)
                .Single(r => r.Id == id);
    }

    private static CreateTransportRequestDetailRequest Detail(
        int sequenceNo,
        Guid containerId,
        Guid source,
        Guid destination,
        Guid? sourceLocation = null,
        short? sourceLevel = null,
        Guid? destinationLocation = null,
        short? destinationLevel = null) =>
        new(sequenceNo, containerId, sourceLocation, source, sourceLevel, destinationLocation, destination, destinationLevel);

    private static CreateTransportRequestRequest Request(
        params CreateTransportRequestDetailRequest[] details) =>
        new(WarehouseId, MapVersionId, WorkflowId, new Dictionary<string, JsonElement>(), "note", details.ToList());

    [Fact]
    public async Task Creates_internal_relocation_with_one_detail()
    {
        var handler = CreateHandler(out var db);

        var response = await handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD)));

        Assert.Equal("REQ-20261006-000001", response.RequestCode);
        Assert.Equal("SUBMITTED", response.Status);
        Assert.Equal(1, response.PlanSchemaVersion);
        var detail = Assert.Single(response.Details);
        Assert.Equal("PENDING", detail.Status);
        Assert.Equal(C1, detail.ContainerId);
        Assert.Equal(1, db.RequestCount());
        Assert.Equal(1, db.DetailCount());
    }

    [Fact]
    public async Task Creates_one_request_with_three_details_sharing_a_pickup()
    {
        var handler = CreateHandler(out var db);

        var response = await handler.HandleAsync(Request(
            Detail(1, C1, EndpointA, EndpointD),
            Detail(2, C2, EndpointA, EndpointE),
            Detail(3, C3, EndpointA, EndpointF)));

        var persisted = db.Load(response.Id);
        var details = persisted.Details.OrderBy(d => d.SequenceNo).ToList();
        Assert.Equal(3, details.Count);
        Assert.All(details, d => Assert.Equal(EndpointA, d.SourceEndpointId));
        Assert.Equal([EndpointD, EndpointE, EndpointF], details.Select(d => d.DestinationEndpointId));
        Assert.Equal([C1, C2, C3], details.Select(d => d.ContainerId));
        Assert.All(details, d => Assert.Equal(TransportRequestDetailStatus.PENDING, d.Status));
        Assert.All(details, d => Assert.Equal(persisted.Id, d.TransportRequestId));
    }

    [Fact]
    public async Task RequestedBy_is_the_authenticated_account()
    {
        var handler = CreateHandler(out var db);

        var response = await handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD)));

        Assert.Equal(_currentUser.AccountId, response.RequestedBy);
        Assert.Equal(_currentUser.AccountId, db.Load(response.Id).RequestedBy);
    }

    [Fact]
    public async Task Rejects_request_without_authenticated_account()
    {
        _currentUser.AccountId = null;
        var handler = CreateHandler(out var db);

        var ex = await Assert.ThrowsAsync<AppException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD))));

        Assert.Equal(401, ex.StatusCode);
        Assert.Equal(0, db.RequestCount());
    }

    [Fact]
    public async Task Rejects_duplicate_sequence_no()
    {
        var handler = CreateHandler(out var db);

        await Assert.ThrowsAsync<ValidationException>(() => handler.HandleAsync(Request(
            Detail(1, C1, EndpointA, EndpointD),
            Detail(1, C2, EndpointA, EndpointE))));

        Assert.Equal(0, db.RequestCount());
    }

    [Fact]
    public async Task Rejects_duplicate_container_in_same_request()
    {
        var handler = CreateHandler(out var db);

        await Assert.ThrowsAsync<ValidationException>(() => handler.HandleAsync(Request(
            Detail(1, C1, EndpointA, EndpointD),
            Detail(2, C1, EndpointA, EndpointE))));

        Assert.Equal(0, db.RequestCount());
    }

    [Fact]
    public async Task Rejects_empty_details()
    {
        var handler = CreateHandler(out _);

        await Assert.ThrowsAsync<ValidationException>(() => handler.HandleAsync(Request()));
    }

    [Fact]
    public async Task Rejects_movement_keys_in_workflow_inputs()
    {
        var handler = CreateHandler(out _);
        var request = Request(Detail(1, C1, EndpointA, EndpointD)) with
        {
            WorkflowInputs = new Dictionary<string, JsonElement>
            {
                ["source.endpointId"] = JsonSerializer.SerializeToElement(EndpointA)
            }
        };

        await Assert.ThrowsAsync<ValidationException>(() => handler.HandleAsync(request));
    }

    [Fact]
    public async Task Rejects_nonexistent_container()
    {
        var handler = CreateHandler(out var db);

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(Request(Detail(1, Guid.NewGuid(), EndpointA, EndpointD))));

        Assert.Equal("container_not_found", ex.Code);
        Assert.Equal(0, db.RequestCount());
    }

    [Fact]
    public async Task Rejects_container_that_is_not_eligible()
    {
        var handler = CreateHandler(out _);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, ReservedContainer, EndpointA, EndpointD))));

        Assert.Equal("container_not_eligible", ex.Code);
    }

    [Fact]
    public async Task Rejects_container_already_in_an_active_request()
    {
        var handler = CreateHandler(out var db);
        await handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD)));

        var second = CreateHandler(out _);
        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            second.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointE))));

        Assert.Equal("container_already_requested", ex.Code);
        Assert.Equal(1, db.RequestCount());
    }

    [Fact]
    public async Task Rejects_nonexistent_endpoint()
    {
        var handler = CreateHandler(out _);

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, Guid.NewGuid()))));

        Assert.Equal("endpoint_not_found", ex.Code);
    }

    [Fact]
    public async Task Rejects_endpoint_not_on_pinned_map_version()
    {
        var handler = CreateHandler(out _);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointOnOtherMap, EndpointD))));

        Assert.Equal("endpoint_not_on_map_version", ex.Code);
    }

    [Fact]
    public async Task Rejects_disabled_endpoint()
    {
        var handler = CreateHandler(out _);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, DisabledEndpoint))));

        Assert.Equal("endpoint_disabled", ex.Code);
    }

    [Fact]
    public async Task Rejects_map_version_that_is_not_published()
    {
        var handler = CreateHandler(out _);
        var request = Request(Detail(1, C1, EndpointOnOtherMap, EndpointOnOtherMap)) with { MapVersionId = OtherMapVersionId };

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() => handler.HandleAsync(request));

        Assert.Equal("map_version_not_published", ex.Code);
    }

    [Fact]
    public async Task Rejects_map_version_of_another_warehouse()
    {
        var otherWarehouse = Guid.NewGuid();
        _warehouse.Warehouses[otherWarehouse] = new WarehouseSnapshot(otherWarehouse, "WH-002", true);
        var handler = CreateHandler(out _);
        var request = Request(Detail(1, C1, EndpointA, EndpointD)) with { WarehouseId = otherWarehouse };

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() => handler.HandleAsync(request));

        Assert.Equal("map_version_warehouse_mismatch", ex.Code);
    }

    [Fact]
    public async Task Rejects_inactive_warehouse()
    {
        _warehouse.Warehouses[WarehouseId] = new WarehouseSnapshot(WarehouseId, "WH-001", false);
        var handler = CreateHandler(out _);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD))));

        Assert.Equal("warehouse_inactive", ex.Code);
    }

    [Fact]
    public async Task Unpublished_workflow_rejected_by_workflow_validator_leaves_nothing_persisted()
    {
        _workflowValidator.ExceptionToThrow = new DomainValidationException("not published", "workflow_not_published");
        var handler = CreateHandler(out var db);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() => handler.HandleAsync(Request(
            Detail(1, C1, EndpointA, EndpointD),
            Detail(2, C2, EndpointA, EndpointE))));

        Assert.Equal("workflow_not_published", ex.Code);
        Assert.Equal(0, db.RequestCount());
        Assert.Equal(0, db.DetailCount());
    }

    [Fact]
    public async Task Invalid_workflow_inputs_rejected_by_workflow_validator_leaves_nothing_persisted()
    {
        _workflowValidator.ExceptionToThrow = new DomainValidationException("missing", "staff_input_missing");
        var handler = CreateHandler(out var db);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD))));

        Assert.Equal("staff_input_missing", ex.Code);
        Assert.Equal(0, db.RequestCount());
        Assert.Equal(0, db.DetailCount());
    }

    [Fact]
    public async Task Snapshot_sent_to_workflow_validator_matches_persisted_request()
    {
        var handler = CreateHandler(out var db);
        var inputs = new Dictionary<string, JsonElement>
        {
            ["handlingInstruction"] = JsonSerializer.SerializeToElement("fragile")
        };
        var sourceLocation = AddLocation(EndpointA, "LOC-A");
        var destinationLocation = AddLocation(EndpointD, "LOC-D");
        var request = Request(
            Detail(2, C2, EndpointA, EndpointE),
            Detail(1, C1, EndpointA, EndpointD, sourceLocation, 1, destinationLocation, 2)) with { WorkflowInputs = inputs };

        var response = await handler.HandleAsync(request);

        var snapshot = _workflowValidator.ReceivedSnapshot!;
        var persisted = db.Load(response.Id);
        Assert.Equal(WorkflowId, _workflowValidator.ReceivedWorkflowId);
        Assert.Equal(persisted.Id, snapshot.TransportRequestId);
        Assert.Equal(persisted.WarehouseId, snapshot.WarehouseId);
        Assert.Equal(persisted.MapVersionId, snapshot.MapVersionId);
        Assert.Equal(persisted.WorkflowId, snapshot.WorkflowId);
        Assert.Equal(persisted.PlanSchemaVersion, snapshot.PlanSchemaVersion);
        Assert.Equal("fragile", snapshot.WorkflowInputs["handlingInstruction"].GetString());
        Assert.Equal("fragile", persisted.WorkflowInputs!["handlingInstruction"].GetString());

        var persistedDetails = persisted.Details.OrderBy(d => d.SequenceNo).ToList();
        Assert.Equal([1, 2], snapshot.Details.Select(d => d.SequenceNo));
        for (var i = 0; i < persistedDetails.Count; i++)
        {
            var p = persistedDetails[i];
            var s = snapshot.Details[i];
            Assert.Equal(p.Id, s.DetailId);
            Assert.Equal(p.ContainerId, s.ContainerId);
            Assert.Equal(p.SourceStorageLocationId, s.SourceStorageLocationId);
            Assert.Equal(p.SourceEndpointId, s.SourceEndpointId);
            Assert.Equal(p.SourceLevelNo, s.SourceLevelNo);
            Assert.Equal(p.DestinationStorageLocationId, s.DestinationStorageLocationId);
            Assert.Equal(p.DestinationEndpointId, s.DestinationEndpointId);
            Assert.Equal(p.DestinationLevelNo, s.DestinationLevelNo);
        }
    }

    [Fact]
    public async Task Storage_location_and_level_are_optional_and_stored_as_given()
    {
        var handler = CreateHandler(out var db);
        var sourceLocation = AddLocation(EndpointA, "LOC-A");
        var destinationLocation = AddLocation(EndpointE, "LOC-E");

        var response = await handler.HandleAsync(Request(
            Detail(1, C1, EndpointA, EndpointD),
            Detail(2, C2, EndpointA, EndpointE, sourceLocation, 3, destinationLocation, null)));

        var details = db.Load(response.Id).Details.OrderBy(d => d.SequenceNo).ToList();
        Assert.Null(details[0].SourceStorageLocationId);
        Assert.Null(details[0].SourceLevelNo);
        Assert.Null(details[0].DestinationStorageLocationId);
        Assert.Null(details[0].DestinationLevelNo);
        Assert.Equal(sourceLocation, details[1].SourceStorageLocationId);
        Assert.Equal((short)3, details[1].SourceLevelNo);
        Assert.Equal(destinationLocation, details[1].DestinationStorageLocationId);
        Assert.Null(details[1].DestinationLevelNo);
    }

    [Fact]
    public async Task Rejects_nonexistent_storage_location()
    {
        var handler = CreateHandler(out var db);

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD, Guid.NewGuid(), 1))));

        Assert.Equal("storage_location_not_found", ex.Code);
        Assert.Equal(0, db.RequestCount());
    }

    [Fact]
    public async Task Rejects_storage_location_endpoint_mismatch()
    {
        var handler = CreateHandler(out _);
        var locationOnA = AddLocation(EndpointA, "LOC-A");

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD, null, null, locationOnA, 1))));

        Assert.Equal("storage_location_endpoint_mismatch", ex.Code);
    }

    [Fact]
    public async Task Rejects_inactive_storage_location()
    {
        var handler = CreateHandler(out _);
        var locationId = AddLocation(EndpointA, "LOC-A", isActive: false);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD, locationId, 1))));

        Assert.Equal("storage_location_inactive", ex.Code);
    }

    [Fact]
    public async Task Rejects_storage_location_of_another_warehouse()
    {
        var handler = CreateHandler(out _);
        var otherWarehouse = Guid.NewGuid();
        var locationId = Guid.NewGuid();
        _warehouse.StorageLocations[locationId] = new StorageLocationSnapshot(
            locationId, otherWarehouse, EndpointA, "LOC-X", "Other", true);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD, locationId, 1))));

        Assert.Equal("storage_location_warehouse_mismatch", ex.Code);
    }

    [Fact]
    public async Task Rejects_level_below_one()
    {
        var handler = CreateHandler(out var db);

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(Request(Detail(1, C1, EndpointA, EndpointD, null, 0))));

        Assert.Equal(0, db.RequestCount());
    }

    private Guid AddLocation(Guid endpointId, string code, bool isActive = true)
    {
        var id = Guid.NewGuid();
        _warehouse.StorageLocations[id] = new StorageLocationSnapshot(
            id, WarehouseId, endpointId, code, code, isActive);
        return id;
    }
}
