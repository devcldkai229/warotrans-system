using System.Text.Json;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Execution;

internal sealed record StopHandover(
    Job Job,
    JobTask StopTask,
    Guid MoveId,
    Guid EndpointId,
    string Action,
    DateTimeOffset MoveStartedAt,
    DateTimeOffset? ReadyAt,
    IReadOnlyList<StopHandoverContainer> Containers)
{
    public DateTimeOffset OfferOpensAt(HumanTaskOptions options) =>
        MoveStartedAt.AddSeconds(Math.Max(options.StopOfferDelaySeconds, 0));

    public DateTimeOffset? BeginDeadline(HumanTaskOptions options) =>
        ReadyAt is { } ready && StopTask.HandoverClaimedAt is { } claimed && StopTask.HandoverBeganAt is null
            ? (ready > claimed ? ready : claimed).AddSeconds(Math.Max(options.StopBeginWindowSeconds, 1))
            : null;

    public Guid? OwnerAt(DateTimeOffset now, HumanTaskOptions options)
    {
        if (StopTask.HandoverBeganAt is not null) return StopTask.HandoverClaimedBy;
        if (StopTask.HandoverClaimMoveId != MoveId) return null;
        return BeginDeadline(options) is { } deadline && deadline <= now ? null : StopTask.HandoverClaimedBy;
    }

    public static StopHandover? Read(Job job, IReadOnlyDictionary<Guid, string> operations)
    {
        if (job.Status != JobStatus.RUNNING) return null;

        var ordered = job.JobTasks.OrderBy(t => t.SequenceNo)
            .SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo).Select(s => (Task: t, Step: s)))
            .ToList();
        var current = ordered.FirstOrDefault(row => row.Step.Status is not (JobStepStatus.COMPLETED or JobStepStatus.SKIPPED));
        if (current.Step is null || Sequence(current.Task) is not { } sequence) return null;

        var atStop = ordered.Where(row => Sequence(row.Task) == sequence).ToList();
        var moves = atStop.Where(row => row.Step.StepType == StepType.MOVE).ToList();
        if (moves.Count != 1) return null;

        var (stop, move) = moves[0];
        if (stop.ContextValues.GetValueOrDefault("stopAction").ValueKind != JsonValueKind.String
            || stop.ContextValues["stopAction"].GetString() is not ("PICKUP" or "DROPOFF")
            || GuidValue(stop.ContextValues, "stopEndpointId") is not { } endpointId
            || move.TargetEndpointId != endpointId
            || move.Status is not (JobStepStatus.EXECUTING or JobStepStatus.COMPLETED)
            || move.OutputValues.ContainsKey(JobExecutionEngine.AreaQueueLegKey)
            || GuidValue(move.OutputValues, "robotCommandId") is not { } moveId
            || move.AcceptedMoveCommandId != moveId || move.MoveAcceptedAt is not { } moveStartedAt) return null;

        var action = stop.ContextValues["stopAction"].GetString()!;
        var operation = action == "PICKUP" ? nameof(HumanActionCode.PICKUP_CONFIRM) : nameof(HumanActionCode.DROPOFF_CONFIRM);
        var containers = new List<StopHandoverContainer>();
        var handovers = atStop.Where(row => operations.GetValueOrDefault(row.Step.WorkflowStepId) == operation).ToList();
        foreach (var (task, step) in handovers)
        {
            if (step.Status is JobStepStatus.COMPLETED or JobStepStatus.SKIPPED) continue;
            if (step.Status is not (JobStepStatus.PENDING or JobStepStatus.READY or JobStepStatus.WAITING)) return null;
            if (GuidValue(task.ContextValues, "containerId") is not { } containerId) return null;
            containers.Add(new StopHandoverContainer(task, step, containerId));
        }

        if (containers.Count == 0 || containers.Select(item => item.ContainerId).Distinct().Count() != containers.Count)
            return null;

        // A group can complete only a continuous run of handover steps, without skipping another operation.
        var pending = ordered.Where(row => row.Step.Id != move.Id
            && row.Step.Status is not (JobStepStatus.COMPLETED or JobStepStatus.SKIPPED));
        if (!pending.Take(containers.Count).Select(row => row.Step.Id).SequenceEqual(containers.Select(item => item.Step.Id)))
            return null;

        var isCurrentHandover = current.Step.Status == JobStepStatus.WAITING
            && containers.Any(item => item.Step.Id == current.Step.Id);
        var ready = move.Status == JobStepStatus.COMPLETED && isCurrentHandover
            ? handovers.Select(row => row.Step.StartedAt)
                .Where(at => move.CompletedAt is null || at >= move.CompletedAt).Min()
            : null;
        if (ready is null && current.Step.Id != move.Id) return null;

        return new StopHandover(job, stop, moveId, endpointId, action, moveStartedAt, ready, containers);
    }

    private static int? Sequence(JobTask task) => task.ContextValues.TryGetValue("stopSequenceNo", out var value)
        && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var sequence) ? sequence : null;

    private static Guid? GuidValue(IReadOnlyDictionary<string, JsonElement> values, string key) =>
        values.TryGetValue(key, out var value) && value.ValueKind == JsonValueKind.String && value.TryGetGuid(out var id) ? id : null;
}

internal sealed record StopHandoverContainer(JobTask Task, JobStep Step, Guid ContainerId);
