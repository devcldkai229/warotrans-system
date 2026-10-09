using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.WorkflowExecution.Enums;
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
        Assert.True(movement.GetArrayLength() > 0);
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

    private static UpsertPayload BuildValidPayload(string code) =>
        new()
        {
            Code = code,
            Name = "Inbound Putaway IT",
            Description = "Integration test workflow",
            Variables =
            [
                Var("minBatteryPercent", "Min battery", WorkflowDataType.DECIMAL, WorkflowVariableSource.ADMIN_INPUT, true, 30m, 0),
                Var("containerId", "Container", WorkflowDataType.UUID, WorkflowVariableSource.STAFF_INPUT, true, null, 1),
                Var("sourceEndpointId", "Source", WorkflowDataType.UUID, WorkflowVariableSource.STAFF_INPUT, true, null, 2),
                Var("destinationEndpointId", "Dest", WorkflowDataType.UUID, WorkflowVariableSource.STAFF_INPUT, true, null, 3),
                Var("assignedRobotId", "Robot", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 4)
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
                            Bind("targetEndpointId", BindingSourceType.WORKFLOW_VAR, "sourceEndpointId"),
                            BindConst("purpose", "PICKUP")),
                        Step("PICKUP_CONFIRM", "Confirm", StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", 4,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.WORKFLOW_VAR, "containerId"),
                            Bind("endpointId", BindingSourceType.WORKFLOW_VAR, "sourceEndpointId"))
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
                            Bind("targetEndpointId", BindingSourceType.WORKFLOW_VAR, "destinationEndpointId"),
                            BindConst("purpose", "DROPOFF")),
                        Step("DROPOFF_CONFIRM", "Confirm drop", StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.WORKFLOW_VAR, "containerId"),
                            Bind("endpointId", BindingSourceType.WORKFLOW_VAR, "destinationEndpointId"))
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
        public List<object> Steps { get; set; } = [];
    }
}
