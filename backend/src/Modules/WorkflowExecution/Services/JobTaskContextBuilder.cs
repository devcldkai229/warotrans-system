using System.Text.Json;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Registry;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// Builds JobTask.ContextValues for each execution scope.
/// JOB: no movement. STOP: stop keys + stop-derived endpoint only. CONTAINER_AT_STOP: full movement.
/// </summary>
public static class JobTaskContextBuilder
{
    public static Dictionary<string, JsonElement> BuildJobScope() =>
        new(StringComparer.Ordinal)
        {
            ["executionScope"] = JsonSerializer.SerializeToElement(ExecutionScope.ONCE_PER_JOB.ToString())
        };

    public static Dictionary<string, JsonElement> BuildStopScope(
        JobStopPlan stop,
        IReadOnlyList<Guid> jobContainerIds)
    {
        var ctx = new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["executionScope"] = JsonSerializer.SerializeToElement(ExecutionScope.ONCE_PER_STOP.ToString()),
            ["stopSequenceNo"] = JsonSerializer.SerializeToElement(stop.SequenceNo),
            ["stopEndpointId"] = JsonSerializer.SerializeToElement(stop.EndpointId),
            ["stopAction"] = JsonSerializer.SerializeToElement(stop.Action.ToString()),
            ["containerIds"] = JsonSerializer.SerializeToElement(stop.ContainerIds),
            ["jobContainerIds"] = JsonSerializer.SerializeToElement(jobContainerIds)
        };

        // Stop-derived endpoint only — never singular container / destination of "first" container.
        if (stop.Action == JobStopAction.PICKUP)
        {
            ctx["source.endpointId"] = JsonSerializer.SerializeToElement(stop.EndpointId);
        }
        else if (stop.Action == JobStopAction.DROPOFF)
        {
            ctx["destination.endpointId"] = JsonSerializer.SerializeToElement(stop.EndpointId);
        }

        return ctx;
    }

    public static Dictionary<string, JsonElement> BuildContainerAtStopScope(
        JobStopPlan stop,
        TransportRequestDetailSnapshot detail,
        JobContainer jobContainer)
    {
        var ctx = new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["executionScope"] = JsonSerializer.SerializeToElement(ExecutionScope.PER_CONTAINER_AT_STOP.ToString()),
            ["stopSequenceNo"] = JsonSerializer.SerializeToElement(stop.SequenceNo),
            ["stopEndpointId"] = JsonSerializer.SerializeToElement(stop.EndpointId),
            ["stopAction"] = JsonSerializer.SerializeToElement(stop.Action.ToString()),
            ["transportRequestDetailId"] = JsonSerializer.SerializeToElement(detail.DetailId),
            ["jobContainerId"] = JsonSerializer.SerializeToElement(jobContainer.Id),
            ["containerId"] = JsonSerializer.SerializeToElement(detail.ContainerId),
            ["source.endpointId"] = JsonSerializer.SerializeToElement(detail.SourceEndpointId),
            ["destination.endpointId"] = JsonSerializer.SerializeToElement(detail.DestinationEndpointId)
        };

        if (detail.SourceStorageLocationId is { } srcLoc)
        {
            ctx["source.storageLocationId"] = JsonSerializer.SerializeToElement(srcLoc);
        }

        if (detail.SourceLevelNo is { } srcLevel)
        {
            ctx["source.levelNo"] = JsonSerializer.SerializeToElement(srcLevel);
        }

        if (detail.DestinationStorageLocationId is { } dstLoc)
        {
            ctx["destination.storageLocationId"] = JsonSerializer.SerializeToElement(dstLoc);
        }

        if (detail.DestinationLevelNo is { } dstLevel)
        {
            ctx["destination.levelNo"] = JsonSerializer.SerializeToElement(dstLevel);
        }

        return ctx;
    }
}
