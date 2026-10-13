using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.WorkflowExecution.Planning;

/// <summary>
/// V1 deterministic "collect first, deliver after" planner.
/// <list type="bullet">
/// <item>One batch per request: WaroTrans has no Robot/Container capacity model yet, so all
/// request Containers go into a single batch. Capacity-based splitting is NOT performed.</item>
/// <item>PICKUP stops: Details grouped by SourceEndpointId, groups ordered by their minimum Detail SequenceNo.</item>
/// <item>DROPOFF stops: Details grouped by DestinationEndpointId, ordered the same way.</item>
/// <item>All PICKUP stops precede all DROPOFF stops; Containers inside a stop follow Detail SequenceNo.</item>
/// </list>
/// No route optimisation (TSP / shortest path) — that is not a Job Planner responsibility.
/// </summary>
public sealed class CollectThenDeliverJobBatchPlanner : IJobBatchPlanner
{
    /// <summary>
    /// Stable key so re-planning the same request yields the same ProvisioningKey (TransportRequestId:BatchKey).
    /// </summary>
    public const string SingleBatchKey = "BATCH-001";

    public IReadOnlyList<JobBatchPlan> Plan(TransportRequestExecutionSnapshot request)
    {
        var details = request.Details.OrderBy(d => d.SequenceNo).ToList();

        var stops = new List<JobStopPlan>();
        AddStops(stops, details, d => d.SourceEndpointId, JobStopAction.PICKUP);
        AddStops(stops, details, d => d.DestinationEndpointId, JobStopAction.DROPOFF);

        var batches = new List<JobBatchPlan>
        {
            new(SingleBatchKey, 1, details.Select(d => d.ContainerId).ToList(), stops)
        };

        EnsureValid(request, batches);
        return batches;
    }

    // details are already ordered by SequenceNo, so GroupBy keeps first-appearance (minimum SequenceNo)
    // order for groups and SequenceNo order for Containers inside each group.
    private static void AddStops(
        List<JobStopPlan> stops,
        IReadOnlyList<TransportRequestDetailSnapshot> details,
        Func<TransportRequestDetailSnapshot, Guid> endpointOf,
        JobStopAction action)
    {
        foreach (var group in details.GroupBy(endpointOf))
        {
            stops.Add(new JobStopPlan(
                stops.Count + 1,
                group.Key,
                action,
                group.Select(d => d.ContainerId).ToList()));
        }
    }

    private static void EnsureValid(TransportRequestExecutionSnapshot request, IReadOnlyList<JobBatchPlan> batches)
    {
        var errors = JobBatchPlanValidator.Validate(request, batches).ToList();

        var planned = batches.SelectMany(b => b.ContainerIds).ToHashSet();
        for (var i = 0; i < request.Details.Count; i++)
        {
            var detail = request.Details[i];
            if (!planned.Contains(detail.ContainerId))
            {
                errors.Add(new JobPlanValidationError(
                    "detail_not_planned",
                    $"details[{i}].containerId",
                    $"Detail {detail.SequenceNo} (container '{detail.ContainerId}') is not part of any batch."));
            }
        }

        if (errors.Count > 0)
        {
            throw new JobPlanValidationException(errors);
        }
    }
}
