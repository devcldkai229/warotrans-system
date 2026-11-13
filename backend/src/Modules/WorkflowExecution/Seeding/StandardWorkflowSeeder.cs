using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.CreateWorkflow;
using WaroTrans.WorkflowExecution.Features.CreateWorkflowVersion;
using WaroTrans.WorkflowExecution.Features.PublishWorkflow;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Features.UpdateWorkflow;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Seeding;

/// <summary>What one seed run did to one workflow code.</summary>
public sealed record WorkflowSeedOutcome(string Code, string Action, Guid WorkflowId, int VersionNo, WorkflowStatus Status);

/// <summary>
/// WF-02 OUTBOUND_RETRIEVAL and WF-03 INTERNAL_RELOCATION, from samples/workflows/WaroTrans_OUTBOUND_INTERNAL_RELOCATION_Seed_Blueprint.json.
/// Goes through the same handlers as the API, so the definition is validated as a DRAFT and again on PUBLISH. Repeatable:
/// <list type="bullet">
/// <item>no version yet: v1 DRAFT, then PUBLISH;</item>
/// <item>latest is a DRAFT: it is overwritten with the definition, then PUBLISHED;</item>
/// <item>latest is PUBLISHED and equal: nothing changes;</item>
/// <item>latest is PUBLISHED and different: a new version is drafted and published. A published version is never edited,
/// Jobs keep the version they were provisioned from.</item>
/// </list>
/// </summary>
public sealed class StandardWorkflowSeeder(
    WorkflowExecutionDbContext db,
    CreateWorkflowHandler create,
    UpdateWorkflowHandler update,
    CreateWorkflowVersionHandler newVersion,
    PublishWorkflowHandler publish)
{
    public static IReadOnlyList<UpsertWorkflowRequest> Definitions() =>
    [
        Define(
            WorkflowMovementRules.Inbound,
            "INBOUND",
            "Put Containers of a confirmed phiếu nhập away: collect them at the receiving point, deliver each to its shelf.",
            "Put the Container on the robot at the receiving point.",
            "Take the Container off the robot and place it on its shelf."),
        Define(
            WorkflowMovementRules.OutboundRetrieval,
            "Outbound Retrieval",
            "Retrieve an identified Container from its storage source and deliver it to an outbound/shipping point.",
            "Take the Container off its shelf and put it on the robot.",
            "Take the Container off the robot at the outbound point."),
        Define(
            WorkflowMovementRules.InternalRelocation,
            "Internal Relocation",
            "Move an identified Container between two valid internal storage locations.",
            "Take the Container off its current shelf and put it on the robot.",
            "Take the Container off the robot and place it on the new shelf.")
    ];

    public Task<IReadOnlyList<WorkflowSeedOutcome>> SeedAsync(bool dryRun, CancellationToken cancellationToken) =>
        SeedAsync(Definitions(), dryRun, cancellationToken);

    /// <summary>Same rules for any definitions (tests use their own codes so they do not touch the standard ones).</summary>
    public async Task<IReadOnlyList<WorkflowSeedOutcome>> SeedAsync(
        IReadOnlyList<UpsertWorkflowRequest> definitions,
        bool dryRun,
        CancellationToken cancellationToken)
    {
        var outcomes = new List<WorkflowSeedOutcome>();
        foreach (var definition in definitions)
        {
            outcomes.Add(await SeedOneAsync(definition, dryRun, cancellationToken));
            db.ChangeTracker.Clear();
        }

        return outcomes;
    }

    private async Task<WorkflowSeedOutcome> SeedOneAsync(UpsertWorkflowRequest definition, bool dryRun, CancellationToken cancellationToken)
    {
        var latest = await db.Workflows.AsNoTracking()
            .Include(w => w.Tasks).ThenInclude(t => t.Steps)
            .Where(w => w.Code == definition.Code)
            .OrderByDescending(w => w.VersionNo)
            .FirstOrDefaultAsync(cancellationToken);

        if (latest is { Status: WorkflowStatus.PUBLISHED }
            && Canonical(WorkflowMapping.ToDefinitionModel(latest)) == Canonical(WorkflowMapping.ToDefinitionModel(definition)))
        {
            return new(definition.Code, "unchanged", latest.Id, latest.VersionNo, latest.Status);
        }

        var plan = latest switch
        {
            null => "created v1",
            { Status: WorkflowStatus.DRAFT } => $"updated draft v{latest.VersionNo}",
            { Status: WorkflowStatus.PUBLISHED } => $"new version v{latest.VersionNo + 1}",
            _ => $"skipped: latest v{latest.VersionNo} is {latest.Status}"
        };
        if (dryRun || latest is { Status: not (WorkflowStatus.DRAFT or WorkflowStatus.PUBLISHED) })
        {
            return new(definition.Code, dryRun ? $"would be {plan}" : plan, latest?.Id ?? Guid.Empty, latest?.VersionNo ?? 0,
                latest?.Status ?? WorkflowStatus.DRAFT);
        }

        Guid draftId;
        if (latest is null)
        {
            draftId = (await create.HandleAsync(Copy<CreateWorkflowRequest>(definition), cancellationToken)).Id;
        }
        else
        {
            draftId = latest.Status == WorkflowStatus.DRAFT
                ? latest.Id
                : (await newVersion.HandleAsync(latest.Id, cancellationToken)).Id;
            db.ChangeTracker.Clear();
            await update.HandleAsync(draftId, Copy<UpdateWorkflowRequest>(definition), cancellationToken);
        }

        db.ChangeTracker.Clear();
        var published = await publish.HandleAsync(draftId, cancellationToken);
        return new(definition.Code, $"{plan}, published", published.Id, published.VersionNo, published.Status);
    }

    private static UpsertWorkflowRequest Define(string code, string name, string description, string pickupText, string dropoffText) =>
        new()
        {
            Code = code,
            Name = name,
            Description = description,
            Variables =
            [
                new WorkflowVariableDefinition
                {
                    Key = "assignedRobotId",
                    Name = "assignedRobotId",
                    DataType = WorkflowDataType.UUID,
                    Source = WorkflowVariableSource.SYSTEM_VALUE,
                    IsRequired = true,
                    Description = "Robot assigned to the current Job.",
                    SequenceNo = 0
                }
            ],
            Tasks =
            [
                StopTask("COLLECT_CONTAINERS", "Collect Containers", 1, "PICKUP", "source.endpointId",
                    "MOVE_TO_PICKUP", "Move to Pickup", "CONFIRM_PICKUP", "Confirm Pickup", "PICKUP_CONFIRM", pickupText),
                StopTask("DELIVER_CONTAINERS", "Deliver Containers", 2, "DROPOFF", "destination.endpointId",
                    "MOVE_TO_DROPOFF", "Move to Dropoff", "CONFIRM_DROPOFF", "Confirm Dropoff", "DROPOFF_CONFIRM", dropoffText)
            ]
        };

    /// <summary>
    /// One MOVE to the stop (expanded once per distinct stop Endpoint: OperationExecutionScopeCatalog MOVE.PICKUP / DROPOFF),
    /// then one confirmation per Container at that stop (PER_CONTAINER_AT_STOP), each bound to its own Container.
    /// </summary>
    private static UpsertWorkflowTaskRequest StopTask(
        string taskKey, string taskName, int sequenceNo, string purpose, string endpointPath,
        string moveKey, string moveName, string confirmKey, string confirmName, string confirmCode, string confirmText) =>
        new()
        {
            TaskKey = taskKey,
            Name = taskName,
            SequenceNo = sequenceNo,
            Steps =
            [
                new UpsertWorkflowStepRequest
                {
                    StepKey = moveKey,
                    Name = moveName,
                    StepType = StepType.MOVE,
                    SequenceNo = 1,
                    OperationCode = purpose,
                    InputBindings = new()
                    {
                        ["robotId"] = Var("assignedRobotId"),
                        ["targetEndpointId"] = Movement(endpointPath),
                        ["purpose"] = Constant(purpose),
                        ["commandTimeoutSeconds"] = Constant(360)
                    },
                    TimeoutSeconds = 360,
                    MaxAttempts = 1,
                    RetryBackoffSeconds = 0,
                    OnFailure = StepFailurePolicy.PAUSE_FOR_OPERATOR
                },
                new UpsertWorkflowStepRequest
                {
                    StepKey = confirmKey,
                    Name = confirmName,
                    StepType = StepType.HUMAN_INTERACTION,
                    SequenceNo = 2,
                    OperationCode = confirmCode,
                    InstructionText = confirmText,
                    InputBindings = new()
                    {
                        ["robotId"] = Var("assignedRobotId"),
                        ["containerId"] = Movement("containerId"),
                        ["endpointId"] = Movement(endpointPath)
                    },
                    TimeoutSeconds = 300,
                    MaxAttempts = 1,
                    RetryBackoffSeconds = 0,
                    OnFailure = StepFailurePolicy.PAUSE_FOR_OPERATOR
                }
            ]
        };

    private static StepInputBinding Var(string key) => new() { SourceType = BindingSourceType.WORKFLOW_VAR, SourceReference = key };

    private static StepInputBinding Movement(string path) => new() { SourceType = BindingSourceType.CURRENT_MOVEMENT, SourceReference = path };

    private static StepInputBinding Constant<T>(T value) => new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = JsonSerializer.SerializeToElement(value) };

    private static T Copy<T>(UpsertWorkflowRequest source) where T : UpsertWorkflowRequest, new() =>
        new()
        {
            Code = source.Code,
            Name = source.Name,
            Description = source.Description,
            Variables = source.Variables,
            Tasks = source.Tasks
        };

    /// <summary>Definition as JSON with object keys sorted: JSONB does not keep the key order it was given.</summary>
    internal static string Canonical(object model)
    {
        var node = JsonSerializer.SerializeToNode(model) ?? new JsonObject();
        return Sort(node)?.ToJsonString() ?? "null";

        static JsonNode? Sort(JsonNode? n) => n switch
        {
            JsonObject o => new JsonObject(o.OrderBy(p => p.Key, StringComparer.Ordinal)
                .Select(p => KeyValuePair.Create(p.Key, Sort(p.Value)))),
            JsonArray a => new JsonArray(a.Select(Sort).ToArray()),
            _ => n?.DeepClone()
        };
    }
}
