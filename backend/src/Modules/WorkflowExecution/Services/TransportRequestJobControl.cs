using Microsoft.EntityFrameworkCore;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>Request-level cancel fan-out over the Jobs of a TransportRequest (TRN-01 / WH-04).</summary>
public sealed class TransportRequestJobControl(
    WorkflowExecutionDbContext db,
    JobExecutionEngine engine,
    Features.RobotCare.RobotCareService robotCare) : ITransportRequestJobControl
{
    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<RequestJobState>>> GetJobsAsync(
        IReadOnlyCollection<Guid> transportRequestIds,
        CancellationToken cancellationToken = default)
    {
        if (transportRequestIds.Count == 0)
        {
            return new Dictionary<Guid, IReadOnlyList<RequestJobState>>();
        }

        var rows = await db.JobContainers.AsNoTracking()
            .Where(c => transportRequestIds.Contains(c.TransportRequestId))
            .Select(c => new { c.TransportRequestId, c.Job.Id, c.Job.JobNo, c.Job.Status })
            .Distinct()
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(r => r.TransportRequestId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<RequestJobState>)g
                    .Select(r => new RequestJobState(r.Id, r.JobNo, r.Status.ToString(), g.Key))
                    .OrderBy(j => j.JobNo)
                    .ToList());
    }

    public async Task<IReadOnlyList<PendingStockHandover>> GetPendingStockHandoversAsync(
        Guid transportRequestId, CancellationToken cancellationToken = default) =>
        await db.StockHandovers.AsNoTracking()
            .Where(handover => handover.TransportRequestId == transportRequestId)
            .Select(handover => new PendingStockHandover(handover.JobId, handover.ContainerId,
                handover.Type == HandoverType.PICKUP, handover.ConfirmedAt,
                handover.Attempts > 0 ? handover.NextAttemptAt : null))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ContainerCancelOutcome>> CancelForRequestAsync(
        Guid transportRequestId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var jobIds = await db.JobContainers.AsNoTracking()
            .Where(c => c.TransportRequestId == transportRequestId)
            .Select(c => c.JobId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var outcomes = new List<ContainerCancelOutcome>();
        foreach (var jobId in jobIds)
        {
            outcomes.AddRange(await engine.CancelForTransportRequestAsync(jobId, transportRequestId, reason, cancellationToken));
        }

        return outcomes;
    }

    public Task<IReadOnlyList<RequestJobCancellationView>> GetCancellationViewAsync(
        Guid transportRequestId,
        CancellationToken cancellationToken = default) =>
        engine.GetCancellationViewAsync(transportRequestId, cancellationToken);

    public async Task<IReadOnlyList<ContainerCancelOutcome>> CancelContainersBeforePickupAsync(
        Guid transportRequestId,
        IReadOnlyCollection<Guid> containerIds,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var jobIds = await db.JobContainers.AsNoTracking()
            .Where(c => c.TransportRequestId == transportRequestId && containerIds.Contains(c.ContainerId))
            .Select(c => c.JobId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var outcomes = new List<ContainerCancelOutcome>();
        foreach (var jobId in jobIds)
        {
            outcomes.AddRange(await engine.CancelContainersBeforePickupAsync(jobId, transportRequestId, containerIds, reason, cancellationToken));
        }

        return outcomes;
    }

    public Task<CancelHandoverResult> HandOverCancelledCargoAsync(
        Guid jobId,
        Guid transportRequestId,
        Guid containerId,
        string? scannedBarcode,
        Guid actor,
        string? note,
        CancellationToken cancellationToken = default) =>
        engine.HandOverCancelledCargoAsync(jobId, transportRequestId, containerId, scannedBarcode, actor, note, cancellationToken);

    public async Task DeliverCancelledCargoAsync(Guid jobId, Guid actor, CancellationToken cancellationToken = default)
    {
        var job = await db.Jobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId, cancellationToken)
            ?? throw new WaroTrans.BuildingBlocks.Exceptions.NotFoundException($"Job '{jobId}' was not found.", "job_not_found");
        // Running already: delivering (no-op), or driving to a recovery point (refused until it is there).
        await engine.ContinueCancelledDeliveryAsync(job.Id, actor, cancellationToken);
    }

    public async Task<IReadOnlyList<RecoveryPointView>> GetRecoveryPointsAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        var robotId = await AssignedRobotAsync(jobId, cancellationToken);
        return robotId is { } id ? await robotCare.RecoveryPointsAsync(id, cancellationToken) : [];
    }

    public async Task<string> SendCancelledCargoToRecoveryAsync(Guid jobId, Guid? endpointId, Guid actor, CancellationToken cancellationToken = default)
    {
        var robotId = await AssignedRobotAsync(jobId, cancellationToken)
            ?? throw new WaroTrans.BuildingBlocks.Exceptions.ConflictException("This Job has no robot.", "robot_required");
        var points = await robotCare.RecoveryPointsAsync(robotId, cancellationToken);
        RecoveryPointView chosen;
        if (endpointId is { } wanted)
        {
            chosen = points.FirstOrDefault(p => p.EndpointId == wanted)
                     ?? throw new WaroTrans.BuildingBlocks.Exceptions.DomainValidationException(
                         "That endpoint is not a recovery (wait / queue) point on the robot's map.", "not_a_recovery_point");
        }
        else
        {
            chosen = points.FirstOrDefault(p => p.Free)
                     ?? throw new WaroTrans.BuildingBlocks.Exceptions.ConflictException(
                         points.Count == 0
                             ? "The map has no recovery (wait / queue) point."
                             : "Every recovery point is taken by another robot. Unload the cargo where the robot stands.",
                         points.Count == 0 ? "no_recovery_point" : "no_free_recovery_point");
        }

        await engine.SendCancelledCargoToRecoveryAsync(jobId, chosen.EndpointId, actor, cancellationToken);
        return chosen.Code;
    }

    public Task<RobotDestinationResult> SendRobotAfterCancelAsync(Guid robotId, bool allowWaitPoint, CancellationToken cancellationToken = default) =>
        robotCare.SendAfterCancelAsync(robotId, allowWaitPoint, cancellationToken);

    private async Task<Guid?> AssignedRobotAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var job = await db.Jobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId, cancellationToken)
            ?? throw new WaroTrans.BuildingBlocks.Exceptions.NotFoundException($"Job '{jobId}' was not found.", "job_not_found");
        return job.ContextValues.TryGetValue(JobExecutionEngine.AssignedRobotKey, out var value) && value.ValueKind == System.Text.Json.JsonValueKind.String
            ? value.GetGuid()
            : null;
    }
}
