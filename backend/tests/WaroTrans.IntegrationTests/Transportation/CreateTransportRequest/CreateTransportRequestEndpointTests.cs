using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.IntegrationTests.Identity;
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
    public async Task Delete_workflow_used_by_a_transport_request_is_refused()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();
        var created = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D)), JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var delete = await Client.DeleteAsync($"/api/workflow-execution/workflows/{workflowId}");

        Assert.Equal(HttpStatusCode.Conflict, delete.StatusCode);
        Assert.Contains("workflow_in_use", await delete.Content.ReadAsStringAsync());
        var stillThere = await Client.GetAsync($"/api/workflow-execution/workflows/{workflowId}");
        Assert.Equal(HttpStatusCode.OK, stillThere.StatusCode);
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
    public async Task Post_queue_splits_into_trips_of_at_most_three_and_persists_them()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();
        var create = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D),
            Detail(2, scenario.Containers[1], scenario.A, scenario.E),
            Detail(3, scenario.Containers[2], scenario.A, scenario.F),
            Detail(4, scenario.Containers[3], scenario.A, scenario.D),
            Detail(5, scenario.Containers[4], scenario.A, scenario.E)), JsonOptions);
        var created = (await create.Content.ReadFromJsonAsync<RequestDto>(JsonOptions))!;

        var response = await Client.PostAsync($"{Route}/{created.Id}/queue", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var queued = (await response.Content.ReadFromJsonAsync<QueueDto>(JsonOptions))!;
        Assert.Equal("QUEUED", queued.Status);
        Assert.Equal(["BATCH-001", "BATCH-002"], queued.Jobs.Select(j => j.BatchKey));
        Assert.Equal([3, 2], queued.Jobs.Select(j => j.JobContainerCount));

        await using var scope = Factory.Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var jobContainers = await execution.JobContainers.ToListAsync();
        Assert.Equal(5, jobContainers.Count);
        Assert.Equal(2, jobContainers.Select(c => c.JobId).Distinct().Count());
        Assert.All(jobContainers, c => Assert.Equal(created.Id, c.TransportRequestId));
        Assert.Equal(scenario.Containers.ToHashSet(), jobContainers.Select(c => c.ContainerId).ToHashSet());

        // Trip 1 picks its three containers up at A in one stop, then delivers to D (two) and E (one).
        var first = queued.Jobs[0];
        var stepKeys = await execution.JobSteps
            .Where(s => s.JobTask.JobId == first.JobId)
            .Join(execution.WorkflowSteps, s => s.WorkflowStepId, w => w.Id, (_, w) => w.StepKey)
            .ToListAsync();
        Assert.Equal(1, stepKeys.Count(k => k == "MOVE_PICKUP"));
        Assert.Equal(3, stepKeys.Count(k => k == "PICKUP_CONFIRM"));
        Assert.Equal(2, stepKeys.Count(k => k == "MOVE_DROPOFF"));
        Assert.Equal(3, stepKeys.Count(k => k == "DROPOFF_CONFIRM"));
        Assert.Equal(first.JobStepCount, stepKeys.Count);

        // The job list tells each trip's number, how many trips the request has, its stops and its containers.
        var list = await Client.GetFromJsonAsync<JsonElement>($"/api/workflow-execution/jobs?transportRequestId={created.Id}&take=10");
        var trip1 = list.GetProperty("items").EnumerateArray().Single(j => j.GetProperty("id").GetGuid() == first.JobId);
        Assert.Equal(1, trip1.GetProperty("tripNo").GetInt32());
        Assert.Equal(2, trip1.GetProperty("tripCount").GetInt32());
        var stops = trip1.GetProperty("stops").EnumerateArray().ToList();
        Assert.Equal(["PICKUP", "DROPOFF", "DROPOFF"], stops.Select(st => st.GetProperty("action").GetString()));
        Assert.Equal([3, 2, 1], stops.Select(st => st.GetProperty("containerCount").GetInt32()));
        Assert.All(stops, st => Assert.False(string.IsNullOrEmpty(st.GetProperty("endpointCode").GetString())));
        Assert.Equal(3, trip1.GetProperty("containers").GetArrayLength());

        var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        var persisted = await db.TransportRequests.Include(r => r.Details).SingleAsync(r => r.Id == created.Id);
        Assert.Equal(WaroTrans.Transportation.Enums.TransportRequestStatus.QUEUED, persisted.Status);
        Assert.All(persisted.Details, d => Assert.Equal(WaroTrans.Transportation.Enums.TransportRequestDetailStatus.QUEUED, d.Status));
    }

    [Fact]
    public async Task Post_queue_twice_returns_the_same_jobs_without_duplicating_runtime_rows()
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
        Assert.Equal(first.Jobs.Select(j => j.JobId), second.Jobs.Select(j => j.JobId));

        await using var scope = Factory.Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        // Two containers fit one robot: one trip, never a second set.
        Assert.Equal(1, await execution.Jobs.CountAsync());
        Assert.Equal(2, await execution.JobContainers.CountAsync());
    }

    [Fact]
    public async Task Post_queue_at_the_same_time_makes_one_set_of_jobs()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();
        var create = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D),
            Detail(2, scenario.Containers[1], scenario.E, scenario.F)), JsonOptions);
        var created = (await create.Content.ReadFromJsonAsync<RequestDto>(JsonOptions))!;

        await Task.WhenAll(
            Client.PostAsync($"{Route}/{created.Id}/queue", null),
            Client.PostAsync($"{Route}/{created.Id}/queue", null),
            Client.PostAsync($"{Route}/{created.Id}/queue", null));

        await using var scope = Factory.Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        // Two containers fit one robot: one trip, never a second set.
        Assert.Equal(1, await execution.Jobs.CountAsync());
        Assert.Equal(2, await execution.JobContainers.CountAsync());
    }

    [Fact]
    public async Task The_waiting_trips_of_a_request_join_the_queue_once_one_trip_runs_and_never_on_their_own()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();
        // 5 containers from A, at most 3 per robot: two trips.
        var create = await Client.PostAsJsonAsync(Route, Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D),
            Detail(2, scenario.Containers[1], scenario.A, scenario.E),
            Detail(3, scenario.Containers[2], scenario.A, scenario.F),
            Detail(4, scenario.Containers[3], scenario.A, scenario.D),
            Detail(5, scenario.Containers[4], scenario.A, scenario.E)), JsonOptions);
        var created = (await create.Content.ReadFromJsonAsync<RequestDto>(JsonOptions))!;
        var jobs = (await (await Client.PostAsync($"{Route}/{created.Id}/queue", null)).Content.ReadFromJsonAsync<QueueDto>(JsonOptions))!.Jobs;
        Assert.Equal(2, jobs.Count);

        await using var scope = Factory.Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var sizes = await execution.JobContainers.GroupBy(c => c.JobId).Select(g => g.Count()).ToListAsync();
        Assert.Equal([2, 3], sizes.Order());

        async Task SetAsync(Guid jobId, WaroTrans.WorkflowExecution.Enums.JobStatus status)
        {
            var job = await execution.Jobs.FirstAsync(j => j.Id == jobId);
            job.Status = status;
            job.StartedAt ??= DateTimeOffset.UtcNow;
            await execution.SaveChangesAsync();
        }

        Task<IReadOnlyList<Guid>> WaitingAsync() =>
            WaroTrans.WorkflowExecution.Services.JobQueueProcessor.FindWaitingTripsOfStartedRequestsAsync(execution, default);

        // Nobody started the request: nothing joins the queue by itself.
        Assert.Empty(await WaitingAsync());

        // Trip 1 runs: trip 2 joins the queue now, for a second robot or for the same one once it is free.
        await SetAsync(jobs[0].JobId, WaroTrans.WorkflowExecution.Enums.JobStatus.RUNNING);
        Assert.Equal(jobs[1].JobId, Assert.Single(await WaitingAsync()));
    }

    [Fact]
    public async Task Lists_show_real_names_page_correctly_and_hide_a_robot_outside_the_scope()
    {
        var scenario = await SeedScenarioAsync();
        var workflowId = await CreatePublishedWorkflowAsync();
        await Factory.CreateAccountAsync("namer", WaroTrans.Identity.Enums.AccountRole.ADMIN);
        await Factory.CreateAccountAsync("no_robots", WaroTrans.Identity.Enums.AccountRole.TECHNICIAN);
        var client = CreateAnonymousClient();
        var admin = (await client.LoginAsync("namer")).AccessToken;
        var tech = (await client.LoginAsync("no_robots")).AccessToken;

        var create = await client.SendWithTokenAsync(HttpMethod.Post, Route, admin, JsonSerializer.SerializeToElement(Body(scenario, workflowId,
            Detail(1, scenario.Containers[0], scenario.A, scenario.D),
            Detail(2, scenario.Containers[1], scenario.A, scenario.E),
            Detail(3, scenario.Containers[2], scenario.A, scenario.D),
            Detail(4, scenario.Containers[3], scenario.A, scenario.E)), JsonOptions));  // two trips: 3 + 1
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var queued = await client.SendWithTokenAsync(HttpMethod.Post, $"{Route}/{created}/queue", admin);
        Assert.Equal(HttpStatusCode.OK, queued.StatusCode);

        Guid robot;
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var fleet = scope.ServiceProvider.GetRequiredService<WaroTrans.Fleet.Persistence.FleetDbContext>();
            var seeded = WaroTrans.Fleet.Entities.Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-NAMED", "Named", DateTimeOffset.UtcNow);
            fleet.Robots.Add(seeded);
            await fleet.SaveChangesAsync();
            robot = seeded.Id;
            var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            foreach (var job in await execution.Jobs.ToListAsync())
            {
                job.ContextValues[WaroTrans.WorkflowExecution.Execution.JobExecutionEngine.AssignedRobotKey] = JsonSerializer.SerializeToElement(robot);
                execution.Entry(job).Property(j => j.ContextValues).IsModified = true;
            }

            await execution.SaveChangesAsync();
        }

        var request = await (await client.GetWithTokenAsync($"{Route}/{created}", admin)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrWhiteSpace(request.GetProperty("requestedByName").GetString()));
        var requests = await (await client.GetWithTokenAsync($"{Route}?take=1", admin)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(request.GetProperty("requestedByName").GetString(), requests.GetProperty("items")[0].GetProperty("requestedByName").GetString());

        var jobsUrl = $"/api/workflow-execution/jobs?transportRequestId={created}&take=1";
        var page1 = await (await client.GetWithTokenAsync(jobsUrl, admin)).Content.ReadFromJsonAsync<JsonElement>();
        var page2 = await (await client.GetWithTokenAsync(jobsUrl + "&skip=1", admin)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, page1.GetProperty("total").GetInt32());
        var one = page1.GetProperty("items")[0];
        Assert.NotEqual(one.GetProperty("id").GetGuid(), page2.GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.Equal("RBT-NAMED", one.GetProperty("robotCode").GetString());
        Assert.Equal(robot, one.GetProperty("assignedRobotId").GetGuid());
        Assert.False(string.IsNullOrWhiteSpace(one.GetProperty("workflowName").GetString()));
        Assert.StartsWith("REQ-", one.GetProperty("requestCodes")[0].GetString());
        Assert.NotEmpty(one.GetProperty("containerBarcodes").EnumerateArray());

        var foreign = (await (await client.GetWithTokenAsync(jobsUrl, tech)).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items")[0];
        Assert.Equal(JsonValueKind.Null, foreign.GetProperty("robotCode").ValueKind);
        Assert.Equal(JsonValueKind.Null, foreign.GetProperty("assignedRobotId").ValueKind);
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
        var containers = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToArray();

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
