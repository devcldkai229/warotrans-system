using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.IntegrationTests.WorkflowExecution.WorkflowTemplates;

[Collection(IntegrationCollection.Name)]
public sealed class WorkflowTemplateIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    [Fact]
    public async Task Metadata_step_types_returns_registry()
    {
        var response = await Client.GetAsync("/api/workflow-execution/metadata/step-types");
        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.True(root.TryGetProperty("stepTypes", out var stepTypes));
        Assert.Equal(4, stepTypes.GetArrayLength());
        Assert.True(root.TryGetProperty("bindingSources", out var bindingSources));
        Assert.Contains(bindingSources.EnumerateArray(), e => e.GetString() == "WORKFLOW_VAR");
        Assert.True(root.TryGetProperty("systemVariables", out var systemVars));
        Assert.True(systemVars.GetArrayLength() > 0);
        Assert.True(root.TryGetProperty("currentMovementFields", out var movement));
        Assert.True(movement.GetArrayLength() >= 9);
        Assert.Contains(
            movement.EnumerateArray(),
            e => e.GetProperty("key").GetString() == "transportRequestDetailId");
        Assert.Contains(
            movement.EnumerateArray(),
            e => e.GetProperty("key").GetString() == "jobContainerId"
                 && e.GetProperty("requiredCapable").GetBoolean());
    }

    [Fact]
    public async Task Create_update_publish_and_version_roundtrip()
    {
        var createBody = BuildValidPayload("WF_IT_" + Guid.NewGuid().ToString("N")[..8]);

        var create = await Client.PostAsJsonAsync("/api/workflow-execution/workflows", createBody, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions);
        Assert.NotNull(created);
        Assert.Equal(WorkflowStatus.DRAFT, created.Status);
        Assert.Equal(1, created.VersionNo);
        Assert.Equal(2, created.Tasks.Count);

        createBody.Name = "Updated name";
        var update = await Client.PutAsJsonAsync(
            $"/api/workflow-execution/workflows/{created.Id}",
            createBody,
            JsonOptions);
        update.EnsureSuccessStatusCode();
        var updated = await update.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions);
        Assert.NotNull(updated);
        Assert.Equal("Updated name", updated.Name);

        var publish = await Client.PostAsync($"/api/workflow-execution/workflows/{created.Id}/publish", null);
        publish.EnsureSuccessStatusCode();
        var published = await publish.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions);
        Assert.NotNull(published);
        Assert.Equal(WorkflowStatus.PUBLISHED, published.Status);
        Assert.NotNull(published.PublishedAt);

        var editPublished = await Client.PutAsJsonAsync(
            $"/api/workflow-execution/workflows/{created.Id}",
            createBody,
            JsonOptions);
        Assert.Equal(HttpStatusCode.Conflict, editPublished.StatusCode);

        var version = await Client.PostAsync($"/api/workflow-execution/workflows/{created.Id}/versions", null);
        Assert.Equal(HttpStatusCode.Created, version.StatusCode);
        var draftV2 = await version.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions);
        Assert.NotNull(draftV2);
        Assert.Equal(2, draftV2.VersionNo);
        Assert.Equal(WorkflowStatus.DRAFT, draftV2.Status);
        Assert.Equal(published.Code, draftV2.Code);

        var get = await Client.GetAsync($"/api/workflow-execution/workflows/{draftV2.Id}");
        get.EnsureSuccessStatusCode();

        var list = await Client.GetAsync($"/api/workflow-execution/workflows?code={published.Code}");
        list.EnsureSuccessStatusCode();
        using var listDoc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(2, listDoc.RootElement.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Request_input_schema_exposes_movement_paths_not_admin_system()
    {
        var createBody = BuildValidPayload("WF_SCHEMA_" + Guid.NewGuid().ToString("N")[..8]);
        var create = await Client.PostAsJsonAsync("/api/workflow-execution/workflows", createBody, JsonOptions);
        create.EnsureSuccessStatusCode();
        var created = await create.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions);
        Assert.NotNull(created);

        var response = await Client.GetAsync(
            $"/api/workflow-execution/workflows/{created.Id}/request-input-schema");
        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        Assert.Equal(created.Id, root.GetProperty("workflowId").GetGuid());

        Assert.True(root.TryGetProperty("workflowInputs", out var workflowInputs));
        Assert.Equal(0, workflowInputs.GetArrayLength());

        Assert.True(root.TryGetProperty("movementInputs", out var movementInputs));
        var keys = movementInputs.EnumerateArray().Select(e => e.GetProperty("key").GetString()).ToList();
        Assert.Contains("containerId", keys);
        Assert.Contains("source.endpointId", keys);
        Assert.Contains("destination.endpointId", keys);
        Assert.DoesNotContain("minBatteryPercent", keys);
        Assert.DoesNotContain("assignedRobotId", keys);

        var container = movementInputs.EnumerateArray()
            .First(e => e.GetProperty("key").GetString() == "containerId");
        Assert.True(container.GetProperty("required").GetBoolean());
    }

    [Fact]
    public async Task Internal_relocation_create_get_publish_roundtrip_and_request_schema()
    {
        var code = "IR_" + Guid.NewGuid().ToString("N")[..8];
        var createBody = BuildInternalRelocationPayload(code);

        var create = await Client.PostAsJsonAsync("/api/workflow-execution/workflows", createBody, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions);
        Assert.NotNull(created);
        Assert.Equal(WorkflowStatus.DRAFT, created.Status);
        Assert.Equal(2, created.Tasks.Count);

        var get = await Client.GetAsync($"/api/workflow-execution/workflows/{created.Id}");
        get.EnsureSuccessStatusCode();
        using var getDoc = JsonDocument.Parse(await get.Content.ReadAsStringAsync());
        var getRoot = getDoc.RootElement;

        var variableKeys = getRoot.GetProperty("variables").EnumerateArray()
            .Select(v => v.GetProperty("key").GetString()).ToList();
        Assert.Equal(
            ["minBatteryPercent", "assignedRobotId", "transportRequestId", "jobId"],
            variableKeys);
        Assert.DoesNotContain("containerId", variableKeys);
        Assert.DoesNotContain("sourceEndpointId", variableKeys);
        Assert.DoesNotContain("destinationEndpointId", variableKeys);

        var pickupSteps = getRoot.GetProperty("tasks").EnumerateArray()
            .First(t => t.GetProperty("taskKey").GetString() == "PICKUP")
            .GetProperty("steps");
        var sourceEndpointBinding = pickupSteps.EnumerateArray()
            .First(s => s.GetProperty("stepKey").GetString() == "CHECK_SOURCE_ENDPOINT")
            .GetProperty("inputBindings").GetProperty("endpointId");
        Assert.Equal("CURRENT_MOVEMENT", sourceEndpointBinding.GetProperty("sourceType").GetString());
        Assert.Equal("source.endpointId", sourceEndpointBinding.GetProperty("sourceReference").GetString());

        var pickupContainer = pickupSteps.EnumerateArray()
            .First(s => s.GetProperty("stepKey").GetString() == "PICKUP_CONFIRM")
            .GetProperty("inputBindings").GetProperty("containerId");
        Assert.Equal("CURRENT_MOVEMENT", pickupContainer.GetProperty("sourceType").GetString());
        Assert.Equal("containerId", pickupContainer.GetProperty("sourceReference").GetString());

        var publish = await Client.PostAsync($"/api/workflow-execution/workflows/{created.Id}/publish", null);
        publish.EnsureSuccessStatusCode();
        var published = await publish.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions);
        Assert.NotNull(published);
        Assert.Equal(WorkflowStatus.PUBLISHED, published.Status);

        var reload = await Client.GetAsync($"/api/workflow-execution/workflows/{created.Id}");
        reload.EnsureSuccessStatusCode();
        using var reloadDoc = JsonDocument.Parse(await reload.Content.ReadAsStringAsync());
        var destBinding = reloadDoc.RootElement.GetProperty("tasks").EnumerateArray()
            .First(t => t.GetProperty("taskKey").GetString() == "DELIVERY")
            .GetProperty("steps").EnumerateArray()
            .First(s => s.GetProperty("stepKey").GetString() == "MOVE_DROPOFF")
            .GetProperty("inputBindings").GetProperty("targetEndpointId");
        Assert.Equal("CURRENT_MOVEMENT", destBinding.GetProperty("sourceType").GetString());
        Assert.Equal("destination.endpointId", destBinding.GetProperty("sourceReference").GetString());

        var schemaResponse = await Client.GetAsync(
            $"/api/workflow-execution/workflows/{created.Id}/request-input-schema");
        schemaResponse.EnsureSuccessStatusCode();
        using var schemaDoc = JsonDocument.Parse(await schemaResponse.Content.ReadAsStringAsync());
        var schema = schemaDoc.RootElement;
        Assert.Equal(created.Id, schema.GetProperty("workflowId").GetGuid());
        Assert.Equal(0, schema.GetProperty("workflowInputs").GetArrayLength());
        var movementKeys = schema.GetProperty("movementInputs").EnumerateArray()
            .Select(e => e.GetProperty("key").GetString()).ToList();
        Assert.Contains("containerId", movementKeys);
        Assert.Contains("source.endpointId", movementKeys);
        Assert.Contains("destination.endpointId", movementKeys);
        Assert.DoesNotContain("minBatteryPercent", movementKeys);
        Assert.DoesNotContain("assignedRobotId", movementKeys);
        Assert.DoesNotContain("transportRequestId", movementKeys);
        Assert.DoesNotContain("jobId", movementKeys);
    }

    [Fact]
    public async Task Publish_invalid_returns_400_with_errors()
    {
        var body = BuildValidPayload("WF_BAD_" + Guid.NewGuid().ToString("N")[..8]);
        // Remove required binding so publish fails
        body.Tasks[0].Steps[2].InputBindings.Remove("targetEndpointId");

        var create = await Client.PostAsJsonAsync("/api/workflow-execution/workflows", body, JsonOptions);
        create.EnsureSuccessStatusCode();
        var created = await create.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions);
        Assert.NotNull(created);

        var publish = await Client.PostAsync($"/api/workflow-execution/workflows/{created.Id}/publish", null);
        Assert.Equal(HttpStatusCode.BadRequest, publish.StatusCode);

        using var doc = JsonDocument.Parse(await publish.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors));
        Assert.True(errors.GetArrayLength() > 0);
    }

    [Fact]
    public async Task Delete_draft_removes_the_workflow_with_its_tasks_and_steps()
    {
        var create = await Client.PostAsJsonAsync(
            "/api/workflow-execution/workflows",
            BuildValidPayload("WF_DEL_" + Guid.NewGuid().ToString("N")[..8]),
            JsonOptions);
        var created = (await create.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions))!;

        var delete = await Client.DeleteAsync($"/api/workflow-execution/workflows/{created.Id}");

        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client.GetAsync($"/api/workflow-execution/workflows/{created.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client.DeleteAsync($"/api/workflow-execution/workflows/{created.Id}")).StatusCode);

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        Assert.False(await db.WorkflowTasks.AnyAsync(t => t.WorkflowId == created.Id));
        Assert.False(await db.WorkflowSteps.AnyAsync(s => s.WorkflowTask.WorkflowId == created.Id));
    }

    [Fact]
    public async Task Delete_published_workflow_that_nothing_uses_leaves_the_other_version()
    {
        var code = "WF_DELV_" + Guid.NewGuid().ToString("N")[..8];
        var create = await Client.PostAsJsonAsync("/api/workflow-execution/workflows", BuildValidPayload(code), JsonOptions);
        var v1 = (await create.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions))!;
        (await Client.PostAsync($"/api/workflow-execution/workflows/{v1.Id}/publish", null)).EnsureSuccessStatusCode();
        var version = await Client.PostAsync($"/api/workflow-execution/workflows/{v1.Id}/versions", null);
        var v2 = (await version.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions))!;

        var delete = await Client.DeleteAsync($"/api/workflow-execution/workflows/{v1.Id}");

        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client.GetAsync($"/api/workflow-execution/workflows/{v1.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync($"/api/workflow-execution/workflows/{v2.Id}")).StatusCode);
    }

    /// <summary>The payload the UI sends for a new workflow: no code, no task keys, no step keys.</summary>
    private static UpsertPayload WithoutCodeOrKeys(UpsertPayload payload)
    {
        payload.Code = string.Empty;
        foreach (var task in payload.Tasks)
        {
            task.TaskKey = string.Empty;
            foreach (var step in task.Steps)
            {
                step.StepKey = string.Empty;
            }
        }

        return payload;
    }

    [Fact]
    public async Task Create_without_code_or_keys_generates_them_from_the_names_and_keeps_them_unique()
    {
        var first = await CreateAsync(WithoutCodeOrKeys(BuildValidPayload("ignored")));
        var second = await CreateAsync(WithoutCodeOrKeys(BuildValidPayload("ignored")));

        Assert.Equal("INBOUND_PUTAWAY_IT", first.Code);
        Assert.Equal("INBOUND_PUTAWAY_IT_2", second.Code);
        Assert.Equal("PICKUP", first.Tasks[0].TaskKey);                  // the task is named "Pickup"
        Assert.All(first.Tasks, task => Assert.False(string.IsNullOrWhiteSpace(task.TaskKey)));
        Assert.Equal(first.Tasks.Count, first.Tasks.Select(t => t.TaskKey).Distinct().Count());
        var stepKeys = first.Tasks.SelectMany(t => t.Steps).Select(s => s.StepKey).ToList();
        Assert.All(stepKeys, key => Assert.False(string.IsNullOrWhiteSpace(key)));
        Assert.Equal(stepKeys.Count, stepKeys.Distinct().Count());
    }

    [Fact]
    public async Task Update_keeps_the_code_and_the_keys_it_is_sent_and_generates_the_missing_ones()
    {
        var created = await CreateAsync(WithoutCodeOrKeys(BuildValidPayload("ignored")));
        var existingKeys = created.Tasks.SelectMany(t => t.Steps).Select(s => s.StepKey).ToList();

        // The UI sends back the keys it got and leaves the code out; a step added in the editor has no key yet.
        var update = WithoutCodeOrKeys(BuildValidPayload("ignored"));
        update.Name = "Renamed Workflow";
        for (var t = 0; t < update.Tasks.Count; t++)
        {
            update.Tasks[t].TaskKey = created.Tasks[t].TaskKey;
            for (var s = 0; s < update.Tasks[t].Steps.Count; s++)
            {
                update.Tasks[t].Steps[s].StepKey = created.Tasks[t].Steps[s].StepKey;
            }
        }

        var extra = update.Tasks[0].Steps[0];
        update.Tasks[0].Steps.Add(new UpsertStepPayload
        {
            StepKey = string.Empty,
            Name = extra.Name,                      // same name as an existing step: must not reuse its key
            StepType = extra.StepType,
            OperationCode = extra.OperationCode,
            SequenceNo = update.Tasks[0].Steps.Count + 1,
            InputBindings = extra.InputBindings
        });

        var response = await Client.PutAsJsonAsync($"/api/workflow-execution/workflows/{created.Id}", update, JsonOptions);
        response.EnsureSuccessStatusCode();
        var updated = (await response.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions))!;

        Assert.Equal(created.Code, updated.Code);                       // renaming does not change the code
        Assert.Equal("Renamed Workflow", updated.Name);
        var updatedKeys = updated.Tasks.SelectMany(t => t.Steps).Select(s => s.StepKey).ToList();
        foreach (var key in existingKeys)
        {
            Assert.Contains(key, updatedKeys);
        }

        Assert.Equal(updatedKeys.Count, updatedKeys.Distinct().Count());
        Assert.Equal(existingKeys.Count + 1, updatedKeys.Count);
    }

    private async Task<WorkflowDetailDto> CreateAsync(UpsertPayload payload)
    {
        var response = await Client.PostAsJsonAsync("/api/workflow-execution/workflows", payload, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WorkflowDetailDto>(JsonOptions))!;
    }

    private static UpsertPayload BuildValidPayload(string code) =>
        new()
        {
            Code = code,
            Name = "Inbound Putaway IT",
            Description = "Integration test workflow",
            Variables =
            [
                Var("minBatteryPercent", "Min battery", WorkflowDataType.DECIMAL, WorkflowVariableSource.ADMIN_INPUT, true, 30m, 0),
                Var("assignedRobotId", "Robot", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 1),
                Var("transportRequestId", "Request", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 2),
                Var("jobId", "Job", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 3)
            ],
            Tasks =
            [
                new UpsertTaskPayload
                {
                    TaskKey = "PICKUP",
                    Name = "Pickup",
                    SequenceNo = 1,
                    Steps =
                    [
                        Step("CHECK_READY", "Ready", StepType.CHECK, "ROBOT_READY", 1,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                        Step("CHECK_BATTERY", "Battery", StepType.CHECK, "BATTERY_MIN", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("minimumBatteryPercent", BindingSourceType.WORKFLOW_VAR, "minBatteryPercent")),
                        Step("MOVE_PICKUP", "Move pickup", StepType.MOVE, "PICKUP", 3,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"),
                            BindConst("purpose", "PICKUP")),
                        Step("PICKUP_CONFIRM", "Confirm", StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", 4,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"))
                    ]
                },
                new UpsertTaskPayload
                {
                    TaskKey = "DELIVERY",
                    Name = "Delivery",
                    SequenceNo = 2,
                    Steps =
                    [
                        Step("MOVE_DROPOFF", "Move dropoff", StepType.MOVE, "DROPOFF", 1,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"),
                            BindConst("purpose", "DROPOFF")),
                        Step("DROPOFF_CONFIRM", "Confirm drop", StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"))
                    ]
                }
            ]
        };

    private static UpsertPayload BuildInternalRelocationPayload(string code) =>
        new()
        {
            Code = code,
            Name = "Internal Relocation IT",
            Description = "CURRENT_MOVEMENT bindings; no movement STAFF_INPUT variables",
            Variables =
            [
                Var("minBatteryPercent", "Min battery", WorkflowDataType.DECIMAL, WorkflowVariableSource.ADMIN_INPUT, true, 25m, 0),
                Var("assignedRobotId", "Robot", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 1),
                Var("transportRequestId", "Request", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 2),
                Var("jobId", "Job", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 3)
            ],
            Tasks =
            [
                new UpsertTaskPayload
                {
                    TaskKey = "PICKUP",
                    Name = "Pickup",
                    SequenceNo = 1,
                    Steps =
                    [
                        Step("CHECK_READY", "Ready", StepType.CHECK, "ROBOT_READY", 1,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                        Step("CHECK_BATTERY", "Battery", StepType.CHECK, "BATTERY_MIN", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("minimumBatteryPercent", BindingSourceType.WORKFLOW_VAR, "minBatteryPercent")),
                        Step("CHECK_REQUEST", "Request", StepType.CHECK, "REQUEST_ACTIVE", 3,
                            Bind("transportRequestId", BindingSourceType.WORKFLOW_VAR, "transportRequestId")),
                        Step("CHECK_SOURCE_ENDPOINT", "Source EP", StepType.CHECK, "ENDPOINT_AVAILABLE", 4,
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId")),
                        Step("MOVE_PICKUP", "Move pickup", StepType.MOVE, "PICKUP", 5,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"),
                            BindConst("purpose", "PICKUP")),
                        Step("PICKUP_CONFIRM", "Confirm", StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", 6,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"))
                    ]
                },
                new UpsertTaskPayload
                {
                    TaskKey = "DELIVERY",
                    Name = "Delivery",
                    SequenceNo = 2,
                    Steps =
                    [
                        Step("CHECK_DEST_ENDPOINT", "Dest EP", StepType.CHECK, "ENDPOINT_AVAILABLE", 1,
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId")),
                        Step("MOVE_DROPOFF", "Move dropoff", StepType.MOVE, "DROPOFF", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"),
                            BindConst("purpose", "DROPOFF")),
                        Step("DROPOFF_CONFIRM", "Confirm drop", StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", 3,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"))
                    ]
                }
            ]
        };

    private static WorkflowVariableDefinition Var(
        string key,
        string name,
        WorkflowDataType dataType,
        WorkflowVariableSource source,
        bool required,
        object? configured,
        int sequence) =>
        new()
        {
            Key = key,
            Name = name,
            DataType = dataType,
            Source = source,
            IsRequired = required,
            SequenceNo = sequence,
            ConfiguredValue = configured is null ? null : JsonSerializer.SerializeToElement(configured)
        };

    private static UpsertStepPayload Step(
        string key,
        string name,
        StepType type,
        string operation,
        int sequence,
        params (string, StepInputBinding)[] bindings) =>
        new()
        {
            StepKey = key,
            Name = name,
            StepType = type,
            OperationCode = operation,
            SequenceNo = sequence,
            InputBindings = bindings.ToDictionary(b => b.Item1, b => b.Item2)
        };

    private static (string, StepInputBinding) Bind(string input, BindingSourceType source, string reference) =>
        (input, new StepInputBinding { SourceType = source, SourceReference = reference });

    private static (string, StepInputBinding) BindConst(string input, string value) =>
        (input, new StepInputBinding
        {
            SourceType = BindingSourceType.CONSTANT,
            ConstantValue = JsonSerializer.SerializeToElement(value)
        });

    private sealed class UpsertPayload
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public List<WorkflowVariableDefinition> Variables { get; set; } = [];
        public List<UpsertTaskPayload> Tasks { get; set; } = [];
    }

    private sealed class UpsertTaskPayload
    {
        public string TaskKey { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public int SequenceNo { get; set; }
        public List<UpsertStepPayload> Steps { get; set; } = [];
    }

    private sealed class UpsertStepPayload
    {
        public string StepKey { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public StepType StepType { get; set; }
        public int SequenceNo { get; set; }
        public string OperationCode { get; set; } = string.Empty;
        public Dictionary<string, StepInputBinding> InputBindings { get; set; } = new();
    }

    private sealed class WorkflowDetailDto
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public int VersionNo { get; set; }
        public string Name { get; set; } = string.Empty;
        public WorkflowStatus Status { get; set; }
        public DateTimeOffset? PublishedAt { get; set; }
        public List<TaskDto> Tasks { get; set; } = [];
    }

    private sealed class TaskDto
    {
        public string TaskKey { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public List<StepDto> Steps { get; set; } = [];
    }

    private sealed class StepDto
    {
        public string StepKey { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }
}
