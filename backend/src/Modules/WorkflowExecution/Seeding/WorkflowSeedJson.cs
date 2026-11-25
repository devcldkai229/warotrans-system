using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Seeding;

/// <summary>A seed file that cannot be used, named so the person who edits it can find the mistake.</summary>
public sealed class WorkflowSeedFileException(string file, string message) : Exception($"{file}: {message}")
{
    public string File { get; } = file;
}

/// <summary>
/// The converter between seed files and workflow definitions. One file per workflow, in the same shape as the body of
/// <c>POST /api/workflow-execution/workflows</c> (camelCase, enums as names), so a file can be pasted into the API or
/// exported from a configured database. ADMIN_INPUT values are never kept in a file: they name Endpoints and groups of
/// one map, which differ from database to database; an administrator chooses them before publishing.
/// </summary>
public static class WorkflowSeedJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new JsonStringEnumConverter() }
    };

    /// <summary>Every <c>*.json</c> of the directory, by file name. Each must parse, pass the DRAFT rules and have its own code.</summary>
    public static IReadOnlyList<UpsertWorkflowRequest> ReadDirectory(string directory)
    {
        if (!Directory.Exists(directory))
        {
            throw new WorkflowSeedFileException(directory, "seed directory not found.");
        }

        var definitions = new List<UpsertWorkflowRequest>();
        var codes = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var file in Directory.GetFiles(directory, "*.json").Order(StringComparer.Ordinal))
        {
            var definition = Read(Path.GetFileName(file), File.ReadAllText(file));
            if (!codes.TryAdd(definition.Code, Path.GetFileName(file)))
            {
                throw new WorkflowSeedFileException(Path.GetFileName(file), $"code '{definition.Code}' is already used by {codes[definition.Code]}.");
            }

            definitions.Add(definition);
        }

        return definitions;
    }

    /// <summary>One seed file's text: parsed, cleared of ADMIN_INPUT values and checked with the DRAFT rules.</summary>
    public static UpsertWorkflowRequest Read(string file, string json)
    {
        UpsertWorkflowRequest? definition;
        try
        {
            definition = JsonSerializer.Deserialize<UpsertWorkflowRequest>(json, Options);
        }
        catch (JsonException error)
        {
            throw new WorkflowSeedFileException(file, $"invalid JSON at line {(error.LineNumber ?? 0) + 1} ({error.Path}): {error.Message}");
        }

        if (definition is null || string.IsNullOrWhiteSpace(definition.Code))
        {
            throw new WorkflowSeedFileException(file, "a workflow needs a code.");
        }

        ClearAdminValues(definition.Variables);
        var check = WorkflowDefinitionValidator.ValidateDraft(WorkflowMapping.ToDefinitionModel(definition));
        if (!check.IsValid)
        {
            throw new WorkflowSeedFileException(file, string.Join("; ", check.Errors.Select(e => $"{e.Path}: {e.Message}")));
        }

        return definition;
    }

    /// <summary>A stored workflow as a seed file: its definition without ids, versions or ADMIN_INPUT values.</summary>
    public static string Write(Workflow workflow)
    {
        var model = WorkflowMapping.ToDefinitionModel(workflow);
        var variables = model.Variables.Select(v => new WorkflowVariableDefinition
        {
            Key = v.Key,
            Name = v.Name,
            DataType = v.DataType,
            Source = v.Source,
            IsRequired = v.IsRequired,
            DefaultValue = v.DefaultValue,
            ConfiguredValue = v.ConfiguredValue,
            Description = v.Description,
            SequenceNo = v.SequenceNo,
            Format = v.Format
        }).ToList();
        ClearAdminValues(variables);

        var definition = new UpsertWorkflowRequest
        {
            Code = model.Code,
            Name = model.Name,
            Description = model.Description,
            StaffVisible = workflow.StaffVisible ? null : false,
            Variables = variables,
            Tasks = model.Tasks.Select(t => new UpsertWorkflowTaskRequest
            {
                TaskKey = t.TaskKey,
                Name = t.Name,
                SequenceNo = t.SequenceNo,
                RunCondition = t.RunCondition,
                Steps = t.Steps.Select(s => new UpsertWorkflowStepRequest
                {
                    StepKey = s.StepKey,
                    Name = s.Name,
                    StepType = s.StepType,
                    SequenceNo = s.SequenceNo,
                    OperationCode = s.OperationCode,
                    InstructionText = s.InstructionText,
                    InputBindings = s.InputBindings,
                    TimeoutSeconds = s.TimeoutSeconds,
                    MaxAttempts = s.MaxAttempts,
                    RetryBackoffSeconds = s.RetryBackoffSeconds,
                    OnFailure = s.OnFailure
                }).ToList()
            }).ToList()
        };
        return JsonSerializer.Serialize(definition, Options) + Environment.NewLine;
    }

    private static void ClearAdminValues(IEnumerable<WorkflowVariableDefinition> variables)
    {
        foreach (var variable in variables.Where(v => v.Source == WorkflowVariableSource.ADMIN_INPUT))
        {
            variable.ConfiguredValue = null;
        }
    }
}
