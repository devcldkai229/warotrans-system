using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Worker.Services;

namespace WaroTrans.Evidence.Worker.Features.OutboxPublisher;

/// <summary>
/// Puts the Evidence outbox on its queue (MediaProcessRequested → media-process). The row was written in the same
/// transaction as the state it announces, so nothing is announced that was not saved and nothing saved is lost.
/// Rows are claimed with SKIP LOCKED: several workers never send the same row together (a crash between send and
/// mark can send twice; consumers are idempotent).
/// </summary>
public sealed class EvidenceOutboxPublisher(
    IServiceScopeFactory scopes,
    IWorkQueue queue,
    IOptions<WorkerOptions> options,
    TimeProvider clock,
    ILogger<EvidenceOutboxPublisher> logger) : BackgroundService
{
    private static readonly Dictionary<string, string> QueueOf = new(StringComparer.Ordinal)
    {
        [MediaProcessRequested.Type] = EvidenceQueues.MediaProcess
    };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PublishOnceAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Evidence outbox publish failed");
            }

            await Task.Delay(TimeSpan.FromMilliseconds(Math.Max(100, options.Value.OutboxIntervalMs)), clock, stoppingToken);
        }
    }

    public async Task<int> PublishOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
        var now = clock.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var rows = await db.Outbox
            .FromSqlInterpolated($"""
                SELECT * FROM evidence.outbox
                WHERE published_at_utc IS NULL AND (next_attempt_at_utc IS NULL OR next_attempt_at_utc <= {now})
                ORDER BY created_at_utc
                LIMIT 50
                FOR UPDATE SKIP LOCKED
                """)
            .ToListAsync(cancellationToken);
        foreach (var row in rows)
        {
            row.AttemptCount++;
            if (!QueueOf.TryGetValue(row.EventType, out var target))
            {
                row.PublishedAtUtc = now;
                row.LastError = $"no queue for {row.EventType}";
                continue;
            }

            try
            {
                await queue.SendAsync(target, row.Payload, cancellationToken);
                row.PublishedAtUtc = now;
                row.LastError = null;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                row.NextAttemptAtUtc = now.AddSeconds(Math.Min(300, Math.Pow(2, Math.Min(row.AttemptCount, 8))));
                row.LastError = ex.Message.Length <= 2000 ? ex.Message : ex.Message[..2000];
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return rows.Count;
    }
}
