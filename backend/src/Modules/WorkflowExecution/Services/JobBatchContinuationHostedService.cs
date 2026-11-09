using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// WH-08: a request split into several Jobs runs them one after the other. Once someone has started the request and its
/// running Job has ended, the next one starts on the best free robot. With no robot free it stays CREATED and is tried
/// again; a person can also start it by hand. A request nobody started never moves by itself.
/// </summary>
public sealed class JobBatchContinuationHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<JobBatchContinuationHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(5);

    private static readonly JobStatus[] Ended = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED];

    /// <summary>The next Job of each request whose earlier Jobs have all ended, at least one having been started.</summary>
    public static async Task<IReadOnlyList<Guid>> FindNextAsync(WorkflowExecutionDbContext db, CancellationToken cancellationToken)
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
            var startedBefore = others.Any(j => j.StartedAt is not null);
            if (waiting.Count > 0 && startedBefore && others.All(j => Ended.Contains(j.Status)))
            {
                next.Add(waiting.OrderBy(j => j.ProvisioningKey, StringComparer.Ordinal).First().Id);
            }
        }

        return next;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Job batch continuation tick failed");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        IReadOnlyList<Guid> next;
        await using (var scope = scopeFactory.CreateAsyncScope())
        {
            next = await FindNextAsync(scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>(), cancellationToken);
        }

        foreach (var jobId in next)
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            try
            {
                await scope.ServiceProvider.GetRequiredService<JobExecutionEngine>().StartAsync(jobId, null, cancellationToken);
                logger.LogInformation("Started Job {JobId}, the next batch of its request", jobId);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // Usually no robot is free yet; the next tick tries again.
                logger.LogDebug(exception, "Next batch Job {JobId} could not start yet", jobId);
            }
        }
    }
}
