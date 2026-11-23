using System.Text.Json;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>
/// Container problems at a handover or at the quality inspection: "Container failed" and a FAILED inspection both take
/// the container off the Job, open a CONTAINER issue with its problem code, and have Warehouse hold the container where
/// it is. One list of codes (<see cref="ContainerProblemCodes"/>): what is seen from outside at any stop, what is inside
/// only where the container is opened (the inspection).
/// </summary>
public sealed partial class JobExecutionEngine
{
    private const string InspectionFailuresKey = "inspectionFailures";

    /// <summary>The code of a container taken off its Job here; none (an older client) is OTHER.</summary>
    public static string ContainerProblemFor(string? problemCode, bool atInspection)
    {
        var code = string.IsNullOrWhiteSpace(problemCode) ? ContainerProblemCodes.Other : problemCode.Trim().ToUpperInvariant();
        if (ContainerProblemCodes.Find(code) is null)
            throw new DomainValidationException($"Unknown container problem '{problemCode}'.", "container_problem_code_invalid");
        if (!atInspection && !ContainerProblemCodes.SeenAtHandover(code))
            throw new DomainValidationException(
                $"{code} is only seen when the container is opened, at the quality inspection.",
                "container_problem_inspection_only");
        return code;
    }

    /// <summary>Every problem an inspection found, in the order given; none is OTHER.</summary>
    public static IReadOnlyList<string> InspectionDefectsFor(IReadOnlyList<string>? defects)
    {
        var codes = (defects ?? []).Where(d => !string.IsNullOrWhiteSpace(d)).Select(d => d.Trim().ToUpperInvariant()).Distinct().ToList();
        if (codes.Count == 0) return [ContainerProblemCodes.Other];
        var unknown = codes.FirstOrDefault(d => ContainerProblemCodes.Find(d) is null);
        if (unknown is not null)
            throw new DomainValidationException($"Unknown container problem '{unknown}'.", "container_problem_code_invalid");
        return codes;
    }

    /// <summary>
    /// A FAILED inspection: that container (the one given, or the only one on board) leaves the Job at the inspection
    /// point. The inspection waits for the containers still on board; with none left it is done (FAILED).
    /// </summary>
    private async Task<JobStep> FailAtInspectionAsync(
        Job job, JobTask task, JobStep step, WorkflowStep workflowStep, Guid? containerId, HumanConfirmationSource source,
        DateTimeOffset now, IDbContextTransaction? transaction, CancellationToken cancellationToken)
    {
        var onBoard = job.JobContainers.Where(jc => jc.Status == JobContainerStatus.ONBOARD).Select(jc => jc.ContainerId).ToList();
        var inspected = containerId ?? (onBoard.Count == 1 ? onBoard[0] : (Guid?)null)
            ?? throw new DomainValidationException("Say which container failed the inspection.", "inspection_container_required");
        if (!onBoard.Contains(inspected))
            throw new DomainValidationException("That container is not on the robot.", "handover_container_mismatch");

        var defects = InspectionDefectsFor(source.Defects);
        var reason = source.Note!.Trim();
        var failure = await FailContainerCoreAsync(job, step, inspected, defects[0], reason, now, cancellationToken);

        // The step keeps a record of each container that failed here, even while it waits for the others.
        var failures = step.OutputValues.TryGetValue(InspectionFailuresKey, out var earlier) && earlier.ValueKind == JsonValueKind.Array
            ? earlier.EnumerateArray().Select(e => e.Clone()).ToList()
            : [];
        failures.Add(JsonSerializer.SerializeToElement(new { containerId = inspected, defects, note = reason, by = source.UserId, at = now }));
        step.OutputValues = new Dictionary<string, JsonElement>(step.OutputValues)
        {
            [InspectionFailuresKey] = JsonSerializer.SerializeToElement(failures)
        };

        CloseInspectionWithNothingLeft(job, task, step, workflowStep, source.UserId, reason, now);
        await SaveAndPublishAsync(cancellationToken, transaction);
        logger.LogWarning("Job {JobNo}: container {ContainerId} failed inspection ({Defects}): {Reason}",
            job.JobNo, inspected, string.Join(",", defects), reason);

        await ReportFailedContainerAsync(job, task, step, workflowStep, failure, defects, source.UserId, cancellationToken);
        await AdvanceAsync(job.Id, cancellationToken);
        return step;
    }

    /// <summary>An inspection with no container left on board has nothing more to look at: it is done, FAILED.</summary>
    private void CloseInspectionWithNothingLeft(
        Job job, JobTask task, JobStep step, WorkflowStep workflowStep, Guid? actorId, string reason, DateTimeOffset now)
    {
        if (workflowStep.Config.OperationCode != nameof(HumanActionCode.INSPECTION_CONFIRM)
            || step.Status != JobStepStatus.WAITING
            || job.JobContainers.Any(jc => jc.Status == JobContainerStatus.ONBOARD))
            return;

        var failures = step.OutputValues.GetValueOrDefault(InspectionFailuresKey);
        CompleteHumanStep(job, task, step, workflowStep,
            new HumanConfirmationSource(ConfirmationSource.STAFF_APP, UserId: actorId, Note: reason), now, inspectionResult: "FAILED");
        if (failures.ValueKind == JsonValueKind.Array)
            step.OutputValues[InspectionFailuresKey] = failures;
    }

    /// <summary>
    /// After the failure is saved: a CONTAINER issue (who, what, where) and the container held where it is. A failure here
    /// does not undo the Job change: it is logged, and the issue can still be opened by hand.
    /// </summary>
    private async Task ReportFailedContainerAsync(
        Job job, JobTask task, JobStep step, WorkflowStep workflowStep, ContainerFailure failure, IReadOnlyList<string> defects,
        Guid? actorId, CancellationToken cancellationToken)
    {
        if (issueReporter is null) return;
        var containerId = failure.Container.ContainerId;
        var at = StopEndpointOf(task, step);
        var where = failure.OnBoard
            ? "It was on the robot: set down at this stop and held here."
            : "It was not picked up: left where it is and held there.";
        try
        {
            var issueId = await issueReporter.ReportContainerProblemAsync(
                new ContainerProblemDraft(
                    $"fail:{job.Id:N}:{containerId:N}",
                    job.Id,
                    job.JobNo,
                    step.Id,
                    workflowStep.StepKey,
                    containerId,
                    failure.Container.TransportRequestId,
                    AssignedRobot(job),
                    actorId,
                    failure.Code,
                    defects,
                    $"{string.Join(", ", defects)}: {failure.Reason.TrimEnd('.', ' ')}. Taken off Job {job.JobNo} at \"{(string.IsNullOrWhiteSpace(workflowStep.Name) ? workflowStep.StepKey : workflowStep.Name)}\". {where}",
                    RemovedFromJob: true,
                    HeldAtEndpointId: at),
                cancellationToken);
            if (containerHolds is not null)
            {
                await containerHolds.HoldAsync(
                    new ContainerHoldRequest(containerId, failure.Code, issueId, ContainerHoldMode.NOW, at, job.Id, actorId, failure.Reason),
                    cancellationToken);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(exception, "Job {JobNo}: container {ContainerId} failed but its issue or hold could not be recorded", job.JobNo, containerId);
        }
    }

    /// <summary>The point this step happens at: its endpoint input, else where its move went.</summary>
    private static Guid? StopEndpointOf(JobTask task, JobStep step)
    {
        if (step.ResolvedInputs.TryGetValue("endpointId", out var endpoint) && endpoint.ValueKind == JsonValueKind.String && endpoint.TryGetGuid(out var id))
            return id;
        return step.TargetEndpointId
            ?? task.JobSteps.Where(s => s.SequenceNo < step.SequenceNo && s.TargetEndpointId is not null)
                .OrderByDescending(s => s.SequenceNo).Select(s => s.TargetEndpointId).FirstOrDefault();
    }
}
