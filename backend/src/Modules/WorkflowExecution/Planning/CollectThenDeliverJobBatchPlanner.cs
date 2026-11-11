using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.WorkflowExecution.Planning;

/// <summary>
/// V1 deterministic "collect first, deliver after" planner.
/// <list type="bullet">
/// <item>One batch per request while its Containers fit the limit (<see cref="JobPlanningOptions.MaxContainersPerJob"/>).
/// Above it (WH-08) Containers with the same source and destination stay together, in Detail order, up to the limit.
/// Keys and contents depend only on the Details, so planning again gives the same batches.</item>
/// <item>PICKUP stops: Details grouped by SourceEndpointId, groups ordered by their minimum Detail SequenceNo.</item>
/// <item>DROPOFF stops: Details grouped by DestinationEndpointId, ordered the same way.</item>
/// <item>All PICKUP stops precede all DROPOFF stops; Containers inside a stop follow Detail SequenceNo.</item>
/// </list>
/// No route optimisation (TSP / shortest path) — that is not a Job Planner responsibility.
/// </summary>
public sealed class CollectThenDeliverJobBatchPlanner(int? maxContainersPerJob = null) : IJobBatchPlanner
{
    /// <summary>
    /// Stable key so re-planning the same request yields the same ProvisioningKey (TransportRequestId:BatchKey).
    /// </summary>
    public const string SingleBatchKey = "BATCH-001";

    public IReadOnlyList<JobBatchPlan> Plan(TransportRequestExecutionSnapshot request, JobPlanLimits? limits = null)
    {
        var details = request.Details.OrderBy(d => d.SequenceNo).ToList();

        var batches = Split(details, limits)
            .Select((group, index) => ToBatch(group, index + 1))
            .ToList();

        EnsureValid(request, batches);
        return batches;
    }

    private IEnumerable<IReadOnlyList<TransportRequestDetailSnapshot>> Split(
        IReadOnlyList<TransportRequestDetailSnapshot> details,
        JobPlanLimits? limits)
    {
        // The smaller of the configured limit and what the largest robot carries (FL-03).
        int? count = (maxContainersPerJob, limits?.MaxContainers) switch
        {
            ({ } configured, { } robots) => Math.Min(configured, robots),
            ({ } configured, null) => configured,
            (null, { } robots) => robots,
            _ => null
        };
        var payload = limits?.MaxPayloadKg;
        decimal WeightOf(TransportRequestDetailSnapshot d) => limits?.WeightsKg.GetValueOrDefault(d.ContainerId) ?? 0;

        var fitsOne = (count is null || details.Count <= Math.Max(count.Value, 1))
                      && (payload is null || details.Sum(WeightOf) <= payload);
        if (fitsOne)
        {
            return [details];
        }

        var batches = new List<IReadOnlyList<TransportRequestDetailSnapshot>>();
        foreach (var route in details.GroupBy(d => (d.SourceEndpointId, d.DestinationEndpointId)))
        {
            var current = new List<TransportRequestDetailSnapshot>();
            decimal weight = 0;
            foreach (var detail in route)
            {
                var full = count is { } most && current.Count >= Math.Max(most, 1);
                var heavy = payload is { } limit && current.Count > 0 && weight + WeightOf(detail) > limit;
                if (full || heavy)
                {
                    batches.Add(current);
                    current = [];
                    weight = 0;
                }

                current.Add(detail);
                weight += WeightOf(detail);
            }

            if (current.Count > 0)
            {
                batches.Add(current);
            }
        }

        return batches;
    }

    private static JobBatchPlan ToBatch(IReadOnlyList<TransportRequestDetailSnapshot> details, int sequenceNo)
    {
        var stops = new List<JobStopPlan>();
        AddStops(stops, details, d => d.SourceEndpointId, JobStopAction.PICKUP);
        AddStops(stops, details, d => d.DestinationEndpointId, JobStopAction.DROPOFF);
        return new JobBatchPlan($"BATCH-{sequenceNo:000}", sequenceNo, details.Select(d => d.ContainerId).ToList(), stops);
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
