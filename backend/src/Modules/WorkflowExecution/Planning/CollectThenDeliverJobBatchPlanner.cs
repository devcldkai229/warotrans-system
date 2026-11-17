using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.WorkflowExecution.Planning;

/// <summary>
/// V1 deterministic "collect first, deliver after" planner.
/// <list type="bullet">
/// <item>A batch is one trip of one robot. One batch per request while its Containers fit the limit
/// (<see cref="JobPlanningOptions.MaxContainersPerJob"/>, at most <see cref="JobPlanningOptions.HardMaxContainersPerRobot"/>).
/// Above it (WH-08) trips are filled in pickup-stop order, then dropoff-stop order, then Detail order, mixing routes:
/// INBOUND takes up to the limit at the pickup point and delivers them to several shelves.
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
        // The smallest of the configured limit, what the largest robot carries (FL-03) and the hard cap of a robot load.
        int count = Math.Min(
            JobPlanningOptions.HardMaxContainersPerRobot,
            (maxContainersPerJob, limits?.MaxContainers) switch
            {
                ({ } configured, { } robots) => Math.Min(configured, robots),
                ({ } configured, null) => configured,
                (null, { } robots) => robots,
                _ => JobPlanningOptions.HardMaxContainersPerRobot
            });
        var payload = limits?.MaxPayloadKg;
        decimal WeightOf(TransportRequestDetailSnapshot d) => limits?.WeightsKg.GetValueOrDefault(d.ContainerId) ?? 0;

        var fitsOne = details.Count <= Math.Max(count, 1)
                      && (payload is null || details.Sum(WeightOf) <= payload);
        if (fitsOne)
        {
            return [details];
        }

        // A trip is one robot load: up to the limit, from one or more pickup stops, to one or more dropoff stops.
        // Containers are taken in pickup-stop order, then dropoff-stop order (first appearance), then Detail order, so
        // INBOUND fills a trip at the one pickup point and keeps Containers bound for the same shelf together, and
        // OUTBOUND collects from as few shelves per trip as the order allows.
        var sourceRank = FirstAppearance(details, d => d.SourceEndpointId);
        var destinationRank = FirstAppearance(details, d => d.DestinationEndpointId);
        var ordered = details
            .OrderBy(d => sourceRank[d.SourceEndpointId])
            .ThenBy(d => destinationRank[d.DestinationEndpointId])
            .ThenBy(d => d.SequenceNo)
            .ToList();

        var batches = new List<IReadOnlyList<TransportRequestDetailSnapshot>>();
        var current = new List<TransportRequestDetailSnapshot>();
        decimal weight = 0;
        foreach (var detail in ordered)
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

        // Inside a trip the stops follow the same order (ToBatch groups by endpoint in first-appearance order).
        return batches;
    }

    private static Dictionary<Guid, int> FirstAppearance(
        IReadOnlyList<TransportRequestDetailSnapshot> details,
        Func<TransportRequestDetailSnapshot, Guid> endpointOf)
    {
        var rank = new Dictionary<Guid, int>();
        foreach (var detail in details)
        {
            rank.TryAdd(endpointOf(detail), rank.Count);
        }

        return rank;
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
