using System.Text.Json;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Registry;

namespace WaroTrans.WorkflowExecution.Runtime;

public static class CurrentMovementContextFactory
{
    public static CurrentMovementContext FromJobTaskContext(IReadOnlyDictionary<string, JsonElement> contextValues)
    {
        ExecutionScope? scope = null;
        if (TryGetString(contextValues, "executionScope", out var scopeText)
            && Enum.TryParse<ExecutionScope>(scopeText, ignoreCase: false, out var parsedScope))
        {
            scope = parsedScope;
        }

        JobStopAction? stopAction = null;
        if (TryGetString(contextValues, "stopAction", out var actionText)
            && Enum.TryParse<JobStopAction>(actionText, ignoreCase: false, out var parsedAction))
        {
            stopAction = parsedAction;
        }

        return new CurrentMovementContext
        {
            Scope = scope,
            StopAction = stopAction,
            ContainerId = GetGuid(contextValues, "containerId"),
            TransportRequestDetailId = GetGuid(contextValues, "transportRequestDetailId"),
            JobContainerId = GetGuid(contextValues, "jobContainerId"),
            SourceEndpointId = GetGuid(contextValues, "source.endpointId"),
            SourceStorageLocationId = GetGuid(contextValues, "source.storageLocationId"),
            SourceLevelNo = GetInt(contextValues, "source.levelNo"),
            DestinationEndpointId = GetGuid(contextValues, "destination.endpointId"),
            DestinationStorageLocationId = GetGuid(contextValues, "destination.storageLocationId"),
            DestinationLevelNo = GetInt(contextValues, "destination.levelNo")
        };
    }

    private static bool TryGetString(
        IReadOnlyDictionary<string, JsonElement> ctx,
        string key,
        out string value)
    {
        value = string.Empty;
        if (!ctx.TryGetValue(key, out var el) || el.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return false;
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = el.GetString() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(value);
    }

    private static Guid? GetGuid(IReadOnlyDictionary<string, JsonElement> ctx, string key)
    {
        if (!ctx.TryGetValue(key, out var el) || el.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        return el.ValueKind == JsonValueKind.String && Guid.TryParse(el.GetString(), out var g)
            ? g
            : el.TryGetGuid(out var g2) ? g2 : null;
    }

    private static int? GetInt(IReadOnlyDictionary<string, JsonElement> ctx, string key)
    {
        if (!ctx.TryGetValue(key, out var el) || el.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var n))
        {
            return n;
        }

        return el.ValueKind == JsonValueKind.String && int.TryParse(el.GetString(), out var s) ? s : null;
    }
}
