using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

public sealed record QueuedJobDto(
    Guid JobId,
    string JobNo,
    int Position,
    int Priority,
    DateTimeOffset? DeadlineAt,
    DateTimeOffset QueuedAt,
    double Score,
    string? BlockingReason);

/// <summary>
/// FL-07: starts queued Jobs on free robots, best score first, and writes down why the others could not go. WH-08: when a
/// started request's running Job has ended, its next Job joins the queue. A request nobody started never moves by itself.
/// </summary>
public sealed class JobQueueProcessor(
    WorkflowExecutionDbContext db,
    JobExecutionEngine engine,
    IOptions<JobQueueOptions> options,
    ILogger<JobQueueProcessor> logger)
{

    /// <summary>
    /// The waiting trips (CREATED Jobs) of every request that is already running: once one trip of a request was
    /// queued or started, all its other trips join the queue. Free robots then take them in queue order, so two robots
    /// carry two trips at once, and one robot takes the next trip as soon as it has delivered the last one.
    /// Trips come in ProvisioningKey (trip) order.
    /// </summary>
    public static async Task<IReadOnlyList<Guid>> FindWaitingTripsOfStartedRequestsAsync(WorkflowExecutionDbContext db, CancellationToken cancellationToken)
    {
        var requests = await db.JobContainers.AsNoTracking()
            .Where(c => c.Job.Status == JobStatus.CREATED)
            .Select(c => c.TransportRequestId)
            .Distinct()
            .ToListAsync(cancellationToken);
        if (requests.Count == 0)
        {
            return [];
        }

        var jobs = await db.JobContainers.AsNoTracking()
            .Where(c => requests.Contains(c.TransportRequestId))
            .Select(c => new { c.TransportRequestId, c.Job.Id, c.Job.Status, c.Job.StartedAt, c.Job.ProvisioningKey })
            .Distinct()
            .ToListAsync(cancellationToken);

        var next = new List<Guid>();
        foreach (var request in jobs.GroupBy(j => j.TransportRequestId))
        {
            var waiting = request.Where(j => j.Status == JobStatus.CREATED).ToList();
            var others = request.Where(j => j.Status != JobStatus.CREATED).ToList();
            var running = others.Any(j => j.StartedAt is not null || j.Status == JobStatus.QUEUED);
            if (waiting.Count > 0 && running)
            {
                next.AddRange(waiting.OrderBy(j => j.ProvisioningKey, StringComparer.Ordinal).Select(j => j.Id));
            }
        }

        return next.Distinct().ToList();
    }

    public async Task<IReadOnlyList<QueuedJobDto>> ListAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var rows = await db.Jobs.AsNoTracking()
            .Where(j => j.Status == JobStatus.QUEUED)
            .Select(j => new { j.Id, j.JobNo, j.Priority, j.DeadlineAt, j.QueuedAt, j.CreatedAt, j.BlockingReason })
            .ToListAsync(cancellationToken);

        return rows
            .Select(j => (Job: j, QueuedAt: j.QueuedAt ?? j.CreatedAt))
            .Select(x => (x.Job, x.QueuedAt, Score: JobQueuePolicy.Score(x.Job.Priority, x.Job.DeadlineAt, x.QueuedAt, now, options.Value)))
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.QueuedAt)
            .ThenBy(x => x.Job.JobNo, StringComparer.Ordinal)
            .Select((x, index) => new QueuedJobDto(
                x.Job.Id, x.Job.JobNo, index + 1, x.Job.Priority, x.Job.DeadlineAt, x.QueuedAt, Math.Round(x.Score, 1), x.Job.BlockingReason))
            .ToList();
    }

    /// <returns>How many Jobs started.</returns>
    public async Task<int> TickAsync(CancellationToken cancellationToken = default)
    {
        foreach (var next in await FindWaitingTripsOfStartedRequestsAsync(db, cancellationToken))
        {
            await engine.EnqueueAsync(next, cancellationToken);
            db.ChangeTracker.Clear();
        }

        var started = 0;
        foreach (var queued in await ListAsync(DateTimeOffset.UtcNow, cancellationToken))
        {
            try
            {
                await engine.StartAsync(queued.JobId, null, cancellationToken);
                started++;
                logger.LogInformation("Queue started Job {JobNo}", queued.JobNo);
            }
            catch (AppException refused)
            {
                db.ChangeTracker.Clear();
                await NoteWhyNotAsync(queued, refused, cancellationToken);
            }

            db.ChangeTracker.Clear();
        }

        return started;
    }

    private async Task NoteWhyNotAsync(QueuedJobDto queued, AppException refused, CancellationToken cancellationToken)
    {
        var reason = $"{refused.Code}: {refused.Message}";
        reason = reason.Length > 500 ? reason[..500] : reason;
        if (reason == queued.BlockingReason)
        {
            return;
        }

        var job = await db.Jobs.FirstAsync(j => j.Id == queued.JobId, cancellationToken);
        job.BlockingReason = reason;
        await db.SaveChangesAsync(cancellationToken);
    }
}
