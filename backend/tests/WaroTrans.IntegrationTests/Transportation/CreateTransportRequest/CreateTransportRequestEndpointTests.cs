using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
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
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.IntegrationTests.Transportation.CreateTransportRequest;

/// <summary>
/// HTTP → EF → PostgreSQL coverage for POST /api/transportation/transport-requests.
/// Validation edge cases live in UnitTests; this class covers persistence of TransportRequest + N Details,
/// RequestedBy from the authenticated user, and that rejected requests leave no rows behind.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class CreateTransportRequestEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private const string Route = "/api/transportation/transport-requests";

    // Default test-auth user (see TestAuthenticationHandler).
    private static readonly Guid TestAccountId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private sealed record IdDto(Guid Id);

    private sealed record DetailDto(
        Guid Id,
        int SequenceNo,
        Guid ContainerId,
        Guid? SourceStorageLocationId,
        Guid SourceEndpointId,
        short? SourceLevelNo,
        Guid? DestinationStorageLocationId,
        Guid DestinationEndpointId,
        short? DestinationLevelNo,
        string Status);

    private sealed record RequestDto(
        Guid Id,
        string RequestCode,
        string Status,
        Guid WarehouseId,
        Guid MapVersionId,
        Guid WorkflowId,
        int PlanSchemaVersion,
        Guid RequestedBy,
        List<DetailDto> Details);

    private sealed record Scenario(
        Guid WarehouseId,
        Guid MapVersionId,
        Guid A,
        Guid D,
        Guid E,
        Guid F,
        Guid[] Containers);

    [Fact]
    public async Task Post_internal_relocation_with_one_detail_persists_request_and_detail()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();

        var response = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D)), JsonOptions);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<RequestDto>(JsonOptions))!;
        Assert.Equal($"{Route}/{created.Id}", response.Headers.Location?.ToString());
        Assert.StartsWith("REQ-", created.RequestCode);
        Assert.Equal("SUBMITTED", created.Status);
        Assert.Equal(1, created.PlanSchemaVersion);
        Assert.Equal(TestAccountId, created.RequestedBy);
        Assert.Equal("PENDING", Assert.Single(created.Details).Status);

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        var persisted = await db.TransportRequests.Include(r => r.Details).SingleAsync(r => r.Id == created.Id);
        Assert.Equal(TestAccountId, persisted.RequestedBy);
        Assert.Equal(scenario.MapVersionId, persisted.MapVersionId);
        Assert.Single(persisted.Details);
    }

    [Fact]
    public async Task Post_three_details_with_shared_pickup_persists_all_details_atomically()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();

        var response = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D),
            Detail(2, scenario.Containers[1], scenario.A, scenario.E),
            Detail(3, scenario.Containers[2], scenario.A, scenario.F)), JsonOptions);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<RequestDto>(JsonOptions))!;

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        var details = await db.TransportRequestDetails
            .Where(d => d.TransportRequestId == created.Id)
            .OrderBy(d => d.SequenceNo)
            .ToListAsync();
        Assert.Equal(3, details.Count);
        Assert.All(details, d => Assert.Equal(scenario.A, d.SourceEndpointId));
        Assert.Equal([scenario.D, scenario.E, scenario.F], details.Select(d => d.DestinationEndpointId));
        Assert.Equal(created.Details.Select(d => d.Id), details.Select(d => d.Id));
    }

    [Fact]
    public async Task Post_with_unpublished_workflow_is_rejected_and_persists_nothing()
    {
        var scenario = await SeedScenarioAsync();
        var draftWorkflowId = await CreateWorkflowAsync(publish: false);

        var response = await Client.PostAsJsonAsync(Route, Body(scenario, draftWorkflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D)), JsonOptions);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("workflow_not_published", await ProblemCodeAsync(response));
        await AssertNothingPersistedAsync();
    }

    [Fact]
    public async Task Post_missing_required_staff_input_is_rejected_and_persists_nothing()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync(requiredStaffInput: "handlingInstruction");

        var response = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D),
            Detail(2, scenario.Containers[1], scenario.A, scenario.E)), JsonOptions);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("staff_input_missing", await ProblemCodeAsync(response));
        await AssertNothingPersistedAsync();
    }

    [Fact]
    public async Task Post_same_container_in_second_active_request_returns_conflict()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();

        var first = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D)), JsonOptions);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.E)), JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("container_already_requested", await ProblemCodeAsync(second));
    }

    private sealed record QueuedJobDto(Guid JobId, string JobNo, string BatchKey, int JobContainerCount, int JobTaskCount, int JobStepCount);

    private sealed record QueueDto(Guid TransportRequestId, string Status, DateTimeOffset? QueuedAt, List<QueuedJobDto> Jobs);

    [Fact]
    public async Task Post_queue_plans_one_batch_and_persists_job_runtime_graph()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();
        var create = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D),
            Detail(2, scenario.Containers[1], scenario.A, scenario.E),
            Detail(3, scenario.Containers[2], scenario.A, scenario.F)), JsonOptions);
        var created = (await create.Content.ReadFromJsonAsync<RequestDto>(JsonOptions))!;

        var response = await Client.PostAsync($"{Route}/{created.Id}/queue", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var queued = (await response.Content.ReadFromJsonAsync<QueueDto>(JsonOptions))!;
        Assert.Equal("QUEUED", queued.Status);
        var job = Assert.Single(queued.Jobs);
        Assert.Equal("BATCH-001", job.BatchKey);
        Assert.Equal(3, job.JobContainerCount);

        await using var scope = Factory.Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var jobContainers = await execution.JobContainers.Where(c => c.JobId == job.JobId).ToListAsync();
        Assert.Equal(3, jobContainers.Count);
        Assert.All(jobContainers, c => Assert.Equal(created.Id, c.TransportRequestId));
        Assert.Equal(scenario.Containers.ToHashSet(), jobContainers.Select(c => c.ContainerId).ToHashSet());

        // Shared pickup A: one MOVE_PICKUP, three PICKUP_CONFIRM; three dropoff stops.
        var stepKeys = await execution.JobSteps
            .Where(s => s.JobTask.JobId == job.JobId)
            .Join(execution.WorkflowSteps, s => s.WorkflowStepId, w => w.Id, (_, w) => w.StepKey)
            .ToListAsync();
        Assert.Equal(1, stepKeys.Count(k => k == "MOVE_PICKUP"));
        Assert.Equal(3, stepKeys.Count(k => k == "PICKUP_CONFIRM"));
        Assert.Equal(3, stepKeys.Count(k => k == "MOVE_DROPOFF"));
        Assert.Equal(3, stepKeys.Count(k => k == "DROPOFF_CONFIRM"));
        Assert.Equal(job.JobStepCount, stepKeys.Count);

        var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        var persisted = await db.TransportRequests.Include(r => r.Details).SingleAsync(r => r.Id == created.Id);
        Assert.Equal(WaroTrans.Transportation.Enums.TransportRequestStatus.QUEUED, persisted.Status);
        Assert.All(persisted.Details, d => Assert.Equal(WaroTrans.Transportation.Enums.TransportRequestDetailStatus.QUEUED, d.Status));
    }

    [Fact]
    public async Task Post_queue_twice_returns_same_job_without_duplicating_runtime_rows()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();
        var create = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D),
            Detail(2, scenario.Containers[1], scenario.E, scenario.F)), JsonOptions);
        var created = (await create.Content.ReadFromJsonAsync<RequestDto>(JsonOptions))!;

        var first = (await (await Client.PostAsync($"{Route}/{created.Id}/queue", null)).Content.ReadFromJsonAsync<QueueDto>(JsonOptions))!;
        var secondResponse = await Client.PostAsync($"{Route}/{created.Id}/queue", null);

        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        var second = (await secondResponse.Content.ReadFromJsonAsync<QueueDto>(JsonOptions))!;
        Assert.Equal(first.Jobs.Single().JobId, second.Jobs.Single().JobId);

        await using var scope = Factory.Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        Assert.Equal(1, await execution.Jobs.CountAsync());
        Assert.Equal(2, await execution.JobContainers.CountAsync());
    }

    [Fact]
    public async Task Post_queue_unknown_request_returns_not_found()
    {
        var response = await Client.PostAsync($"{Route}/{Guid.NewGuid()}/queue", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("transport_request_not_found", await ProblemCodeAsync(response));
    }

    private static object Body(Scenario scenario, Guid workflowId, params object[] details) => new
    {
        warehouseId = scenario.WarehouseId,
        mapVersionId = scenario.MapVersionId,
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

    private async Task AssertNothingPersistedAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        Assert.Equal(0, await db.TransportRequests.CountAsync());
        Assert.Equal(0, await db.TransportRequestDetails.CountAsync());
    }

    private static async Task<string?> ProblemCodeAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    private async Task<Scenario> SeedScenarioAsync()
    {
        var warehouseId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var containers = new[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid() };

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            var category = new ProductCategory { Id = Guid.NewGuid(), Code = "CAT-IT", Name = "IT" };
            var product = new Product
            {
                Id = Guid.NewGuid(),
                CategoryId = category.Id,
                Sku = "SKU-IT-000001",
                Name = "IT product",
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            };
            db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
            {
                Id = warehouseId,
                Code = "WH-IT",
                Name = "IT warehouse",
                Timezone = "Asia/Ho_Chi_Minh",
                IsActive = true,
                CreatedAt = now
            });
            db.ProductCategories.Add(category);
            db.Products.Add(product);
            for (var i = 0; i < containers.Length; i++)
            {
                db.Containers.Add(new Container
                {
                    Id = containers[i],
                    ProductId = product.Id,
                    Barcode = $"CTN-IT-{i + 1}",
                    Status = ContainerStatus.STORED,
                    CreatedBy = TestAccountId,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }

            await db.SaveChangesAsync();
        }

        var mapResponse = await Client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Map", mapUri = "http://storage/map.yaml", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        mapResponse.EnsureSuccessStatusCode();
        var mapId = (await mapResponse.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;

        var a = await CreateEndpointAsync(mapId, "Shelf A");
        var d = await CreateEndpointAsync(mapId, "Shelf D");
        var e = await CreateEndpointAsync(mapId, "Shelf E");
        var f = await CreateEndpointAsync(mapId, "Shelf F");

        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        return new Scenario(warehouseId, mapId, a, d, e, f, containers);
    }

    private async Task<Guid> CreateEndpointAsync(Guid mapId, string name)
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", new
        {
            name,
            endpointType = "WAYPOINT",
            x = 1.0,
            y = 2.0,
            yaw = 0.0,
            positionTolerance = 0.1,
            yawTolerance = 0.2
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
    }

    private Task<Guid> CreatePublishedWorkflowAsync(string? requiredStaffInput = null) =>
        CreateWorkflowAsync(publish: true, requiredStaffInput);

    private async Task<Guid> CreateWorkflowAsync(bool publish, string? requiredStaffInput = null)
    {
        // Same shape as the INTERNAL_RELOCATION workflow in WorkflowTemplateIntegrationTests.
        var variables = new List<WorkflowVariableDefinition>
        {
            Var("minBatteryPercent", WorkflowDataType.DECIMAL, WorkflowVariableSource.ADMIN_INPUT, 0, configured: 25m),
            Var("assignedRobotId", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, 1),
            Var("transportRequestId", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, 2)
        };
        if (requiredStaffInput is not null)
        {
            variables.Add(Var(requiredStaffInput, WorkflowDataType.STRING, WorkflowVariableSource.STAFF_INPUT, 3));
        }

        var body = new
        {
            code = "IR_TR_" + Guid.NewGuid().ToString("N")[..8],
            name = "Internal relocation (TransportRequest IT)",
            variables,
            tasks = new object[]
            {
                new
                {
                    taskKey = "PICKUP",
                    name = "Pickup",
                    sequenceNo = 1,
                    steps = new object[]
                    {
                        Step("CHECK_READY", StepType.CHECK, "ROBOT_READY", 1,
                            ("robotId", Bind(BindingSourceType.WORKFLOW_VAR, "assignedRobotId"))),
                        Step("CHECK_BATTERY", StepType.CHECK, "BATTERY_MIN", 2,
                            ("robotId", Bind(BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                            ("minimumBatteryPercent", Bind(BindingSourceType.WORKFLOW_VAR, "minBatteryPercent"))),
                        Step("CHECK_REQUEST", StepType.CHECK, "REQUEST_ACTIVE", 3,
                            ("transportRequestId", Bind(BindingSourceType.WORKFLOW_VAR, "transportRequestId"))),
                        Step("CHECK_SOURCE_ENDPOINT", StepType.CHECK, "ENDPOINT_AVAILABLE", 4,
                            ("endpointId", Bind(BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"))),
                        Step("MOVE_PICKUP", StepType.MOVE, "PICKUP", 5,
                            ("robotId", Bind(BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                            ("targetEndpointId", Bind(BindingSourceType.CURRENT_MOVEMENT, "source.endpointId")),
                            ("purpose", Const("PICKUP"))),
                        Step("PICKUP_CONFIRM", StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", 6,
                            ("robotId", Bind(BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                            ("containerId", Bind(BindingSourceType.CURRENT_MOVEMENT, "containerId")),
                            ("endpointId", Bind(BindingSourceType.CURRENT_MOVEMENT, "source.endpointId")))
                    }
                },
                new
                {
                    taskKey = "DELIVERY",
                    name = "Delivery",
                    sequenceNo = 2,
                    steps = new object[]
                    {
                        Step("CHECK_DEST_ENDPOINT", StepType.CHECK, "ENDPOINT_AVAILABLE", 1,
                            ("endpointId", Bind(BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"))),
                        Step("MOVE_DROPOFF", StepType.MOVE, "DROPOFF", 2,
                            ("robotId", Bind(BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                            ("targetEndpointId", Bind(BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId")),
                            ("purpose", Const("DROPOFF"))),
                        Step("DROPOFF_CONFIRM", StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", 3,
                            ("robotId", Bind(BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                            ("containerId", Bind(BindingSourceType.CURRENT_MOVEMENT, "containerId")),
                            ("endpointId", Bind(BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId")))
                    }
                }
            }
        };

        var create = await Client.PostAsJsonAsync("/api/workflow-execution/workflows", body, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var workflowId = (await create.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;

        if (publish)
        {
            (await Client.PostAsync($"/api/workflow-execution/workflows/{workflowId}/publish", null)).EnsureSuccessStatusCode();
        }

        return workflowId;
    }

    private static WorkflowVariableDefinition Var(
        string key,
        WorkflowDataType type,
        WorkflowVariableSource source,
        int sequence,
        object? configured = null) =>
        new()
        {
            Key = key,
            Name = key,
            DataType = type,
            Source = source,
            IsRequired = true,
            SequenceNo = sequence,
            ConfiguredValue = configured is null ? null : JsonSerializer.SerializeToElement(configured)
        };

    private static object Step(
        string key,
        StepType type,
        string operation,
        int sequence,
        params (string Input, StepInputBinding Binding)[] bindings) => new
    {
        stepKey = key,
        name = key,
        stepType = type,
        operationCode = operation,
        sequenceNo = sequence,
        inputBindings = bindings.ToDictionary(b => b.Input, b => b.Binding)
    };

    private static StepInputBinding Bind(BindingSourceType source, string reference) =>
        new() { SourceType = source, SourceReference = reference };

    private static StepInputBinding Const(string value) =>
        new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = JsonSerializer.SerializeToElement(value) };
}
