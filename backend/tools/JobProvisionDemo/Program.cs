using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.GetWorkflowMetadata;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Registry;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

// Usage:
//   JobProvisionDemo --workflow-id <guid> [outDir]
//   JobProvisionDemo --seed-demo [outDir]
//   JOB_DEMO_WORKFLOW_ID=<guid> JobProvisionDemo [outDir]
// Never pass or persist access tokens.

var seedDemo = args.Any(a => string.Equals(a, "--seed-demo", StringComparison.OrdinalIgnoreCase));
var workflowIdArg = GetArg(args, "--workflow-id");
var positional = args.Where(a => !a.StartsWith("--", StringComparison.Ordinal)).ToArray();
var outDir = positional.Length > 0
    ? positional[0]
    : Path.GetFullPath(Path.Combine(
        AppContext.BaseDirectory, "..", "..", "..", "..", "..", "..", "samples", "job-runtime-demo"));

Directory.CreateDirectory(outDir);
var assumedDir = Path.Combine(outDir, "assumed-fixtures");
var persistedDir = Path.Combine(outDir, "persisted-runtime");
var apiDir = Path.Combine(outDir, "api-responses");
Directory.CreateDirectory(assumedDir);
Directory.CreateDirectory(persistedDir);
Directory.CreateDirectory(apiDir);

var cs = Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
    ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

var services = new ServiceCollection();
services.AddLogging();
services.AddDbContext<CodeSequenceDbContext>(o => o.UseNpgsql(cs));
services.AddDbContext<WorkflowExecutionDbContext>(o => o.UseNpgsql(cs));
services.AddScoped<IBusinessCodeGenerator, BusinessCodeGenerator>();
services.AddScoped<IWorkflowRequestValidator, WorkflowRequestValidator>();
services.AddScoped<IJobRuntimeProvisioner, JobRuntimeProvisioner>();

await using var sp = services.BuildServiceProvider();
await using var scope = sp.CreateAsyncScope();
var validator = scope.ServiceProvider.GetRequiredService<IWorkflowRequestValidator>();
var provisioner = scope.ServiceProvider.GetRequiredService<IJobRuntimeProvisioner>();
var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();

Guid workflowId;
if (seedDemo)
{
    workflowId = await SeedDemoWorkflowAsync(db);
    Console.WriteLine($"Seeded DEMO workflow {workflowId}");
}
else
{
    var workflowIdText = workflowIdArg
        ?? Environment.GetEnvironmentVariable("JOB_DEMO_WORKFLOW_ID")
        ?? throw new InvalidOperationException(
            "Provide --workflow-id <guid>, --seed-demo, or env JOB_DEMO_WORKFLOW_ID. Do not use access tokens.");

    if (!Guid.TryParse(workflowIdText, out workflowId))
    {
        throw new InvalidOperationException($"Invalid workflow id: '{workflowIdText}'.");
    }
}

// ASSUMED / FIXTURE — synthetic TransportRequest (no Transportation row created).
var warehouseId = Guid.Parse("11111111-1111-1111-1111-111111111111");
var mapVersionId = Guid.Parse("22222222-2222-2222-2222-222222222222");
var transportRequestId = Guid.NewGuid();
var endpointA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
var endpointD = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
var endpointE = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
var endpointF = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
var c1 = Guid.Parse("c1000000-0000-4000-8000-000000000001");
var c2 = Guid.Parse("c2000000-0000-4000-8000-000000000002");
var c3 = Guid.Parse("c3000000-0000-4000-8000-000000000003");
var srcLoc1 = Guid.Parse("b1000000-0000-4000-8000-000000000001");
var srcLoc2 = Guid.Parse("b2000000-0000-4000-8000-000000000002");
var srcLoc3 = Guid.Parse("b3000000-0000-4000-8000-000000000003");
var dstLoc1 = Guid.Parse("a1000000-0000-4000-8000-000000000001");
var dstLoc2 = Guid.Parse("a2000000-0000-4000-8000-000000000002");
var dstLoc3 = Guid.Parse("a3000000-0000-4000-8000-000000000003");
var d1 = Guid.NewGuid();
var d2 = Guid.NewGuid();
var d3 = Guid.NewGuid();

var assumedTransportRequestPayload = new
{
    note = "ASSUMED / FIXTURE — POST /api/transportation/transport-requests body (endpoint NOT implemented). No Transportation row is created.",
    warehouseId,
    mapVersionId,
    workflowId,
    workflowInputs = new { },
    details = new object[]
    {
        new { sequenceNo = 1, containerId = c1, sourceStorageLocationId = srcLoc1, sourceEndpointId = endpointA, sourceLevelNo = (short)1, destinationStorageLocationId = dstLoc1, destinationEndpointId = endpointD, destinationLevelNo = (short)2 },
        new { sequenceNo = 2, containerId = c2, sourceStorageLocationId = srcLoc2, sourceEndpointId = endpointA, sourceLevelNo = (short)2, destinationStorageLocationId = dstLoc2, destinationEndpointId = endpointE, destinationLevelNo = (short)1 },
        new { sequenceNo = 3, containerId = c3, sourceStorageLocationId = srcLoc3, sourceEndpointId = endpointA, sourceLevelNo = (short)3, destinationStorageLocationId = dstLoc3, destinationEndpointId = endpointF, destinationLevelNo = (short)3 }
    }
};

var snapshot = new TransportRequestExecutionSnapshot(
    transportRequestId,
    warehouseId,
    mapVersionId,
    workflowId,
    PlanSchemaVersion: 1,
    WorkflowInputs: new Dictionary<string, JsonElement>(),
    Details:
    [
        new(d1, 1, c1, srcLoc1, endpointA, 1, dstLoc1, endpointD, 2),
        new(d2, 2, c2, srcLoc2, endpointA, 2, dstLoc2, endpointE, 1),
        new(d3, 3, c3, srcLoc3, endpointA, 3, dstLoc3, endpointF, 3)
    ]);

var batch = new JobBatchPlan(
    BatchKey: "BATCH-SHARED-PICKUP",
    SequenceNo: 1,
    ContainerIds: [c1, c2, c3],
    Stops:
    [
        new JobStopPlan(1, endpointA, JobStopAction.PICKUP, [c1, c2, c3]),
        new JobStopPlan(2, endpointD, JobStopAction.DROPOFF, [c1]),
        new JobStopPlan(3, endpointE, JobStopAction.DROPOFF, [c2]),
        new JobStopPlan(4, endpointF, JobStopAction.DROPOFF, [c3])
    ]);

var jsonOpts = new JsonSerializerOptions
{
    WriteIndented = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    Converters = { new JsonStringEnumConverter() }
};

var workflowEntity = await db.Workflows
    .AsNoTracking()
    .Include(w => w.Tasks)
    .ThenInclude(t => t.Steps)
    .SingleAsync(w => w.Id == workflowId);

var publishedDetail = WorkflowMapping.ToDetail(workflowEntity);
var createDetail = publishedDetail with
{
    Status = WorkflowStatus.DRAFT,
    PublishedAt = null
};

await File.WriteAllTextAsync(
    Path.Combine(apiDir, "01-workflow.create.response.json"),
    JsonSerializer.Serialize(createDetail, jsonOpts));
await File.WriteAllTextAsync(
    Path.Combine(apiDir, "02-workflow.publish.response.json"),
    JsonSerializer.Serialize(publishedDetail, jsonOpts));
await File.WriteAllTextAsync(
    Path.Combine(apiDir, "03-workflow.get.json"),
    JsonSerializer.Serialize(publishedDetail, jsonOpts));

var schema = RequestInputSchemaBuilder.Build(WorkflowMapping.ToDefinitionModel(workflowEntity));
await File.WriteAllTextAsync(
    Path.Combine(apiDir, "04-request-input-schema.json"),
    JsonSerializer.Serialize(new
    {
        workflowId,
        workflowCode = workflowEntity.Code,
        note = "Workflow metadata only — not the full future TransportRequest form schema.",
        workflowInputs = schema.WorkflowInputs,
        movementInputs = schema.MovementInputs
    }, jsonOpts));

await File.WriteAllTextAsync(
    Path.Combine(assumedDir, "05-assumed-transport-request.payload.json"),
    JsonSerializer.Serialize(assumedTransportRequestPayload, jsonOpts));
await File.WriteAllTextAsync(
    Path.Combine(assumedDir, "06-execution-snapshot.json"),
    JsonSerializer.Serialize(snapshot, jsonOpts));
await File.WriteAllTextAsync(
    Path.Combine(assumedDir, "07-job-batch-plan.json"),
    JsonSerializer.Serialize(batch, jsonOpts));

await validator.ValidateAsync(workflowId, snapshot);
await File.WriteAllTextAsync(
    Path.Combine(assumedDir, "08-validator.ok.json"),
    JsonSerializer.Serialize(new
    {
        valid = true,
        workflowId,
        transportRequestId,
        note = "ASSUMED / FIXTURE — IWorkflowRequestValidator against snapshot only. REQUEST_ACTIVE was NOT executed."
    }, jsonOpts));

var result = await provisioner.ProvisionAsync(snapshot, [batch]);
await File.WriteAllTextAsync(
    Path.Combine(persistedDir, "09-provision.result.json"),
    JsonSerializer.Serialize(result, jsonOpts));

var jobId = result.Jobs[0].JobId;
var job = await db.Jobs
    .AsNoTracking()
    .Include(j => j.JobContainers)
    .Include(j => j.JobTasks)
    .ThenInclude(t => t.JobSteps)
    .SingleAsync(j => j.Id == jobId);

// Prefer the already-loaded demo workflow steps (avoid whole-table dictionary issues).
var workflowSteps = workflowEntity.Tasks
    .SelectMany(t => t.Steps)
    .ToDictionary(s => s.Id);

var export = new
{
    note = "PERSISTED REAL RUNTIME DATA — Job / JobContainer / JobTask / JobStep from WorkflowExecution DB. TransportRequestId is synthetic (no Transportation row).",
    job.Id,
    job.JobNo,
    job.WorkflowId,
    job.MapVersionId,
    job.ProvisioningKey,
    status = job.Status.ToString(),
    job.ContextValues,
    job.CreatedAt,
    job.QueuedAt,
    containers = job.JobContainers
        .OrderBy(c => c.SequenceNo)
        .Select(c => new
        {
            c.Id,
            c.TransportRequestId,
            c.ContainerId,
            c.SequenceNo,
            status = c.Status.ToString()
        }),
    tasks = job.JobTasks
        .OrderBy(t => t.SequenceNo)
        .Select(t => new
        {
            t.Id,
            t.WorkflowTaskId,
            t.SequenceNo,
            status = t.Status.ToString(),
            t.ContextValues,
            steps = t.JobSteps
                .OrderBy(s => s.SequenceNo)
                .Select(s =>
                {
                    workflowSteps.TryGetValue(s.WorkflowStepId, out var ws);
                    return new
                    {
                        s.Id,
                        s.WorkflowStepId,
                        workflowStepKey = ws?.StepKey,
                        operationCode = ws?.Config.OperationCode,
                        stepType = s.StepType.ToString(),
                        s.SequenceNo,
                        status = s.Status.ToString(),
                        resolvedInputs = s.ResolvedInputs,
                        outputValues = s.OutputValues,
                        s.TargetEndpointId
                    };
                })
        }),
    expansionSummary = new
    {
        jobContainerCount = job.JobContainers.Count,
        jobTaskCount = job.JobTasks.Count,
        jobStepCount = job.JobTasks.Sum(t => t.JobSteps.Count),
        movePickupCount = job.JobTasks.SelectMany(t => t.JobSteps)
            .Count(s => workflowSteps.TryGetValue(s.WorkflowStepId, out var ws) && ws.Config.OperationCode == "PICKUP"),
        moveDropoffCount = job.JobTasks.SelectMany(t => t.JobSteps)
            .Count(s => workflowSteps.TryGetValue(s.WorkflowStepId, out var ws) && ws.Config.OperationCode == "DROPOFF"),
        pickupConfirmCount = job.JobTasks.SelectMany(t => t.JobSteps)
            .Count(s => workflowSteps.TryGetValue(s.WorkflowStepId, out var ws) && ws.Config.OperationCode == "PICKUP_CONFIRM"),
        dropoffConfirmCount = job.JobTasks.SelectMany(t => t.JobSteps)
            .Count(s => workflowSteps.TryGetValue(s.WorkflowStepId, out var ws) && ws.Config.OperationCode == "DROPOFF_CONFIRM")
    }
};

await File.WriteAllTextAsync(
    Path.Combine(persistedDir, "10-job.runtime.graph.json"),
    JsonSerializer.Serialize(export, jsonOpts));

// Refresh canonical metadata export (repo samples/workflows).
var metadataPath = Path.GetFullPath(Path.Combine(outDir, "..", "workflows", "workflow-metadata.step-types.json"));
Directory.CreateDirectory(Path.GetDirectoryName(metadataPath)!);
await File.WriteAllTextAsync(metadataPath, JsonSerializer.Serialize(BuildMetadataResponse(), jsonOpts));

AssertArtifactConsistency(outDir, workflowId);

Console.WriteLine($"OK → {outDir}");
Console.WriteLine($"WorkflowId={workflowId} code={workflowEntity.Code}");
Console.WriteLine($"JobNo={job.JobNo} containers={export.expansionSummary.jobContainerCount} " +
                  $"MOVE_PICKUP={export.expansionSummary.movePickupCount} " +
                  $"PICKUP_CONFIRM={export.expansionSummary.pickupConfirmCount} " +
                  $"MOVE_DROPOFF={export.expansionSummary.moveDropoffCount} " +
                  $"DROPOFF_CONFIRM={export.expansionSummary.dropoffConfirmCount}");

static string? GetArg(string[] args, string name)
{
    for (var i = 0; i < args.Length - 1; i++)
    {
        if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
        {
            return args[i + 1];
        }
    }

    return null;
}

static WorkflowMetadataResponse BuildMetadataResponse() =>
    new(
        StepTypeRegistry.All.Select(st => new StepTypeMetadataDto(
            st.StepType.ToString(),
            st.Description,
            st.OperationFieldName,
            st.Operations.Select(op =>
            {
                OperationExecutionScopeCatalog.TryGet(st.StepType, op.Code, out var scopeDef);
                return new OperationMetadataDto(
                    op.Code,
                    op.Description,
                    scopeDef?.Scope.ToString(),
                    scopeDef?.StopActionFilter?.ToString(),
                    op.Inputs.Select(i => new FieldMetadataDto(
                        i.Key,
                        i.DataType.ToString(),
                        i.Required,
                        i.Description,
                        i.AllowedValues)).ToList(),
                    op.Outputs.Select(o => new FieldMetadataDto(
                        o.Key,
                        o.DataType.ToString(),
                        false,
                        o.Description,
                        o.AllowedValues)).ToList());
            }).ToList())).ToList(),
        Enum.GetNames<BindingSourceType>(),
        Enum.GetNames<WorkflowVariableSource>(),
        Enum.GetNames<WorkflowDataType>(),
        Enum.GetNames<StepFailurePolicy>(),
        SystemVariableCatalog.All.Select(s => new CatalogFieldDto(
            s.Key,
            s.DataType.ToString(),
            s.Key,
            s.Description,
            RequiredCapable: false)).ToList(),
        CurrentMovementCatalog.All.Select(m => new CatalogFieldDto(
            m.Path,
            m.DataType.ToString(),
            m.Label,
            m.Description,
            m.IsRequiredCapable)).ToList());

static void AssertArtifactConsistency(string outDir, Guid expectedWorkflowId)
{
    static Guid ReadGuid(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (root.TryGetProperty(name, out var el) && el.ValueKind != JsonValueKind.Null)
            {
                if (el.ValueKind == JsonValueKind.String && Guid.TryParse(el.GetString(), out var g))
                {
                    return g;
                }

                if (el.TryGetGuid(out var g2))
                {
                    return g2;
                }
            }
        }

        throw new InvalidOperationException($"Missing guid property among [{string.Join(',', names)}].");
    }

    static JsonElement Load(string path) =>
        JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(path));

    var api = Path.Combine(outDir, "api-responses");
    var assumed = Path.Combine(outDir, "assumed-fixtures");
    var persisted = Path.Combine(outDir, "persisted-runtime");

    var createId = ReadGuid(Load(Path.Combine(api, "01-workflow.create.response.json")), "id");
    var publishId = ReadGuid(Load(Path.Combine(api, "02-workflow.publish.response.json")), "id");
    var getId = ReadGuid(Load(Path.Combine(api, "03-workflow.get.json")), "id");
    var schemaWf = ReadGuid(Load(Path.Combine(api, "04-request-input-schema.json")), "workflowId");
    var assumedWf = ReadGuid(Load(Path.Combine(assumed, "05-assumed-transport-request.payload.json")), "workflowId");
    var snapshotWf = ReadGuid(Load(Path.Combine(assumed, "06-execution-snapshot.json")), "workflowId");
    var validatorWf = ReadGuid(Load(Path.Combine(assumed, "08-validator.ok.json")), "workflowId");
    var jobWf = ReadGuid(Load(Path.Combine(persisted, "10-job.runtime.graph.json")), "workflowId");

    var ids = new[]
    {
        ("01.create.id", createId),
        ("02.publish.id", publishId),
        ("03.get.id", getId),
        ("04.schema.workflowId", schemaWf),
        ("05.assumed.workflowId", assumedWf),
        ("06.snapshot.workflowId", snapshotWf),
        ("08.validator.workflowId", validatorWf),
        ("10.job.workflowId", jobWf),
        ("expected", expectedWorkflowId)
    };

    var distinct = ids.Select(x => x.Item2).Distinct().ToList();
    if (distinct.Count != 1)
    {
        var detail = string.Join("; ", ids.Select(x => $"{x.Item1}={x.Item2}"));
        throw new InvalidOperationException(
            "Demo artifact WorkflowId consistency check failed: " + detail);
    }
}

static async Task<Guid> SeedDemoWorkflowAsync(WorkflowExecutionDbContext db)
{
    var stamp = DateTimeOffset.UtcNow.ToString("HHmmss");
    var workflow = new Workflow
    {
        Id = Guid.NewGuid(),
        Code = $"DEMO_INTERNAL_RELOCATION_{stamp}",
        VersionNo = 1,
        Name = "Demo Internal Relocation (not canonical WTCP-49)",
        Description = "DEMO fixture. Canonical INTERNAL_RELOCATION v1 is owned by WTCP-49.",
        Status = WorkflowStatus.PUBLISHED,
        VariablesSchema =
        [
            Var("minBatteryPercent", WorkflowDataType.DECIMAL, WorkflowVariableSource.ADMIN_INPUT, 25m),
            Var("assignedRobotId", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, null),
            Var("transportRequestId", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, null),
            Var("jobId", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, null)
        ],
        CreatedBy = Guid.Parse("00000000-0000-0000-0000-000000000001"),
        CreatedAt = DateTimeOffset.UtcNow,
        PublishedAt = DateTimeOffset.UtcNow
    };

    var pickup = new WorkflowTask
    {
        Id = Guid.NewGuid(),
        WorkflowId = workflow.Id,
        TaskKey = "PICKUP",
        Name = "Pickup",
        SequenceNo = 1
    };
    pickup.Steps.Add(Step(pickup.Id, "CHECK_READY", StepType.CHECK, "ROBOT_READY", 1,
        Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId")));
    pickup.Steps.Add(Step(pickup.Id, "CHECK_BATTERY", StepType.CHECK, "BATTERY_MIN", 2,
        Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
        Bind("minimumBatteryPercent", BindingSourceType.WORKFLOW_VAR, "minBatteryPercent")));
    pickup.Steps.Add(Step(pickup.Id, "CHECK_REQUEST", StepType.CHECK, "REQUEST_ACTIVE", 3,
        Bind("transportRequestId", BindingSourceType.WORKFLOW_VAR, "transportRequestId")));
    pickup.Steps.Add(Step(pickup.Id, "CHECK_SOURCE_ENDPOINT", StepType.CHECK, "ENDPOINT_AVAILABLE", 4,
        Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId")));
    pickup.Steps.Add(Step(pickup.Id, "MOVE_PICKUP", StepType.MOVE, "PICKUP", 5,
        Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
        Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"),
        BindConst("purpose", "PICKUP")));
    pickup.Steps.Add(Step(pickup.Id, "PICKUP_CONFIRM", StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", 6,
        Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
        Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
        Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId")));

    var delivery = new WorkflowTask
    {
        Id = Guid.NewGuid(),
        WorkflowId = workflow.Id,
        TaskKey = "DELIVERY",
        Name = "Delivery",
        SequenceNo = 2
    };
    delivery.Steps.Add(Step(delivery.Id, "CHECK_DEST_ENDPOINT", StepType.CHECK, "ENDPOINT_AVAILABLE", 1,
        Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId")));
    delivery.Steps.Add(Step(delivery.Id, "MOVE_DROPOFF", StepType.MOVE, "DROPOFF", 2,
        Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
        Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"),
        BindConst("purpose", "DROPOFF")));
    delivery.Steps.Add(Step(delivery.Id, "DROPOFF_CONFIRM", StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", 3,
        Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
        Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
        Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId")));

    workflow.Tasks.Add(pickup);
    workflow.Tasks.Add(delivery);

    var model = WorkflowMapping.ToDefinitionModel(workflow);
    var publishCheck = WorkflowDefinitionValidator.ValidateForPublish(model);
    if (!publishCheck.IsValid)
    {
        throw new InvalidOperationException(
            "Demo workflow failed publish validation: "
            + string.Join("; ", publishCheck.Errors.Select(e => $"{e.Path}: {e.Message}")));
    }

    db.Workflows.Add(workflow);
    await db.SaveChangesAsync();
    return workflow.Id;
}

static WorkflowVariableDefinition Var(
    string key,
    WorkflowDataType type,
    WorkflowVariableSource source,
    object? configured) =>
    new()
    {
        Key = key,
        Name = key,
        DataType = type,
        Source = source,
        IsRequired = true,
        ConfiguredValue = configured is null ? null : JsonSerializer.SerializeToElement(configured)
    };

static WorkflowStep Step(
    Guid taskId,
    string key,
    StepType type,
    string operation,
    int seq,
    params (string, StepInputBinding)[] bindings) =>
    new()
    {
        Id = Guid.NewGuid(),
        WorkflowTaskId = taskId,
        StepKey = key,
        Name = key,
        StepType = type,
        SequenceNo = seq,
        Config = new WorkflowStepConfig { OperationCode = operation },
        InputBindings = bindings.ToDictionary(b => b.Item1, b => b.Item2),
        TimeoutSeconds = 30,
        MaxAttempts = 1,
        OnFailure = StepFailurePolicy.FAIL_JOB
    };

static (string, StepInputBinding) Bind(string input, BindingSourceType source, string reference) =>
    (input, new StepInputBinding { SourceType = source, SourceReference = reference });

static (string, StepInputBinding) BindConst(string input, string value) =>
    (input, new StepInputBinding
    {
        SourceType = BindingSourceType.CONSTANT,
        ConstantValue = JsonSerializer.SerializeToElement(value)
    });
