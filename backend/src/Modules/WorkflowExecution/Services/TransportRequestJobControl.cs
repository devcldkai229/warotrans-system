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
}
