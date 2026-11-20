using Microsoft.EntityFrameworkCore;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>Request-level cancel fan-out over the Jobs of a TransportRequest (TRN-01 / WH-04).</summary>
public sealed class TransportRequestJobControl(WorkflowExecutionDbContext db, JobExecutionEngine engine) : ITransportRequestJobControl
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
        if (job.Status == Enums.JobStatus.RUNNING)
        {
            return; // already delivering
        }

        await engine.ResumeAsync(jobId, null, cancellationToken, actor);
    }
}
