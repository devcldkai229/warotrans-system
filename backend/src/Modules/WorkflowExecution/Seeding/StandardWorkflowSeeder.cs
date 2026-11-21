using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.CreateWorkflow;
using WaroTrans.WorkflowExecution.Features.CreateWorkflowVersion;
using WaroTrans.WorkflowExecution.Features.PublishWorkflow;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Features.UpdateWorkflow;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Seeding;

/// <summary>What one seed run did to one workflow code.</summary>
public sealed record WorkflowSeedOutcome(string Code, string Action, Guid WorkflowId, int VersionNo, WorkflowStatus Status);

/// <param name="DryRun">Only report what would happen.</param>
/// <param name="NewVersion">When the latest version is PUBLISHED and the seed differs, draft a new version from the seed.</param>
/// <param name="Publish">Publish what was seeded (tests only: a real seed leaves DRAFTs for an administrator).</param>
public sealed record WorkflowSeedOptions(bool DryRun = false, bool NewVersion = false, bool Publish = false);

/// <summary>
/// Puts seed definitions (backend/seed/workflows, read by <see cref="WorkflowSeedJson"/>) into the database through the
/// same handlers as the API, so the DRAFT rules apply. A seeded workflow is a DRAFT: an administrator sets its ADMIN_INPUT
/// values (inspection point, gates, parking group, …) and publishes it. Never overwrites what an administrator has:
/// <list type="bullet">
/// <item>no version yet: v1 DRAFT;</item>
/// <item>the latest version equals the seed: unchanged;</item>
/// <item>the latest version is a DRAFT: left alone (it may hold the administrator's work);</item>
/// <item>the latest version is PUBLISHED and differs: left alone, or with <see cref="WorkflowSeedOptions.NewVersion"/> a
/// new DRAFT version from the seed. A published version is never edited; Jobs keep the version they were made from.</item>
/// </list>
/// </summary>
public sealed class StandardWorkflowSeeder(
    WorkflowExecutionDbContext db,
    CreateWorkflowHandler create,
    UpdateWorkflowHandler update,
    CreateWorkflowVersionHandler newVersion,
    PublishWorkflowHandler publish)
{
    public async Task<IReadOnlyList<WorkflowSeedOutcome>> SeedAsync(
        IReadOnlyList<UpsertWorkflowRequest> definitions,
        WorkflowSeedOptions options,
        CancellationToken cancellationToken)
    {
        var outcomes = new List<WorkflowSeedOutcome>();
        foreach (var definition in definitions)
        {
            outcomes.Add(await SeedOneAsync(definition, options, cancellationToken));
            db.ChangeTracker.Clear();
        }

        return outcomes;
    }

    private async Task<WorkflowSeedOutcome> SeedOneAsync(UpsertWorkflowRequest definition, WorkflowSeedOptions options, CancellationToken cancellationToken)
    {
        var latest = await db.Workflows.AsNoTracking()
            .Include(w => w.Tasks).ThenInclude(t => t.Steps)
            .Where(w => w.Code == definition.Code)
            .OrderByDescending(w => w.VersionNo)
            .FirstOrDefaultAsync(cancellationToken);

        // ADMIN_INPUT values are the administrator's, not the seed's: they never count as a difference.
        if (latest is not null && Canonical(WithoutAdminValues(WorkflowMapping.ToDefinitionModel(latest)))
            == Canonical(WithoutAdminValues(WorkflowMapping.ToDefinitionModel(definition))))
        {
            return new(definition.Code, "unchanged", latest.Id, latest.VersionNo, latest.Status);
        }

        var plan = latest switch
        {
            null => "created v1",
            { Status: WorkflowStatus.PUBLISHED } when options.NewVersion => $"new version v{latest.VersionNo + 1}",
            { Status: WorkflowStatus.DRAFT } => $"skipped: v{latest.VersionNo} is a DRAFT (finish or delete it first)",
            { Status: WorkflowStatus.PUBLISHED } => $"skipped: v{latest.VersionNo} is PUBLISHED and differs (--new-version drafts the seed)",
            _ => $"skipped: latest v{latest.VersionNo} is {latest.Status}"
        };
        if (options.DryRun || plan.StartsWith("skipped", StringComparison.Ordinal))
        {
            return new(definition.Code, options.DryRun ? $"would be {plan}" : plan, latest?.Id ?? Guid.Empty, latest?.VersionNo ?? 0,
                latest?.Status ?? WorkflowStatus.DRAFT);
        }

        Guid draftId;
        if (latest is null)
        {
            draftId = (await create.HandleAsync(Copy<CreateWorkflowRequest>(definition), cancellationToken)).Id;
        }
        else
        {
            draftId = (await newVersion.HandleAsync(latest.Id, cancellationToken)).Id;
            db.ChangeTracker.Clear();
            await update.HandleAsync(draftId, Copy<UpdateWorkflowRequest>(definition), cancellationToken);
        }

        db.ChangeTracker.Clear();
        if (!options.Publish)
        {
            var draft = await db.Workflows.AsNoTracking().SingleAsync(w => w.Id == draftId, cancellationToken);
            return new(definition.Code, $"{plan} DRAFT", draft.Id, draft.VersionNo, draft.Status);
        }

        var published = await publish.HandleAsync(draftId, cancellationToken);
        return new(definition.Code, $"{plan}, published", published.Id, published.VersionNo, published.Status);
    }

    private static Validation.WorkflowDefinitionModel WithoutAdminValues(Validation.WorkflowDefinitionModel model)
    {
        var copy = JsonSerializer.Deserialize<Validation.WorkflowDefinitionModel>(JsonSerializer.Serialize(model))!;
        foreach (var variable in copy.Variables.Where(v => v.Source == WaroTrans.BuildingBlocks.Enums.WorkflowVariableSource.ADMIN_INPUT))
        {
            variable.ConfiguredValue = null;
        }

        return copy;
    }

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
