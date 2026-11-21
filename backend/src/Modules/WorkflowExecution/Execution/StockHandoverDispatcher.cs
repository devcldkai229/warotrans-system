using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>Delivers committed handovers at least once. Transportation deduplicates the stock postings.</summary>
public sealed class StockHandoverDispatcher(
    IServiceScopeFactory scopes, IIntegrationEventPublisher events, TimeProvider clock,
    ILogger<StockHandoverDispatcher> logger) : BackgroundService
{
    private const int BatchSize = 100;
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval, clock);
        try
        {
            do
            {
                await DispatchAvailableAsync(null, stoppingToken);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // The unacknowledged rows remain available on the next start.
        }
    }

    internal async Task DispatchAvailableAsync(Guid? jobId, CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var now = clock.GetUtcNow();

            // Each row can be delivered by either the request or a worker. A dropoff waits for its pickup even
            // if another dispatcher has locked the pickup row or the pickup is waiting for its retry time.
            var available = await db.StockHandovers.FromSqlInterpolated($"""
                SELECT h.* FROM execution.stock_handover_outbox h
                WHERE ({jobId}::uuid IS NULL OR h.job_id = {jobId}) AND h.next_attempt_at <= {now}
                  AND (h.type = 'PICKUP' OR NOT EXISTS (
                      SELECT 1 FROM execution.stock_handover_outbox pickup
                      WHERE pickup.job_id = h.job_id AND pickup.container_id = h.container_id AND pickup.type = 'PICKUP'))
                ORDER BY h.confirmed_at, h.id
                LIMIT {BatchSize}
                FOR UPDATE OF h SKIP LOCKED
                """).ToListAsync(cancellationToken);

            foreach (var handover in available)
                await DispatchAsync(db, handover, cancellationToken);

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogError(exception, "Could not drain the stock handover outbox for Job {JobId}", jobId);
        }
    }

    private async Task DispatchAsync(WorkflowExecutionDbContext db, StockHandover handover, CancellationToken cancellationToken)
    {
        var status = handover.Type == HandoverType.PICKUP ? JobContainerStatus.ONBOARD : JobContainerStatus.DELIVERED;
        try
        {
            await events.PublishAsync(new JobContainerStatusChanged(
                handover.JobId, handover.TransportRequestId, handover.ContainerId, status.ToString())
            {
                EventId = handover.Id,
                OccurredAt = handover.ConfirmedAt,
                HandoverConfirmedBy = handover.ConfirmedBy
            }, cancellationToken);
            db.StockHandovers.Remove(handover);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            handover.Attempts++;
            handover.NextAttemptAt = clock.GetUtcNow().AddSeconds(Math.Min(60, Math.Pow(2, Math.Min(handover.Attempts, 6))));
            logger.LogWarning(exception, "Handover {HandoverId} for container {ContainerId} awaits retry at {NextAttemptAt}",
                handover.Id, handover.ContainerId, handover.NextAttemptAt);
        }
    }
}
