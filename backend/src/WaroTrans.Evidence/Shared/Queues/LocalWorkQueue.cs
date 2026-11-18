using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Persistence;

namespace WaroTrans.Evidence.Queues;

/// <summary>
/// SQS semantics on a Postgres table (tests, offline dev): a received message is hidden until its visibility timeout;
/// one received <see cref="EvidenceQueueOptions.MaxReceiveCount"/> times goes to the queue's DLQ. Claiming uses
/// <c>FOR UPDATE SKIP LOCKED</c>, so several workers never get the same message at once.
/// </summary>
public sealed class LocalWorkQueue(IDbContextFactory<EvidenceDbContext> contexts, EvidenceQueueOptions options, TimeProvider clock) : IWorkQueue
{
    public static string DeadLetterOf(string queue) => queue + "-dlq";

    public async Task SendAsync(string queue, string body, CancellationToken cancellationToken)
    {
        await using var db = await contexts.CreateDbContextAsync(cancellationToken);
        var now = clock.GetUtcNow();
        db.LocalQueueMessages.Add(new LocalQueueMessage
        {
            Id = Guid.NewGuid(),
            Queue = queue,
            Body = body,
            VisibleAtUtc = now,
            CreatedAtUtc = now
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<QueueMessage>> ReceiveAsync(string queue, int max, TimeSpan wait, TimeSpan visibility, CancellationToken cancellationToken)
    {
        var deadline = clock.GetUtcNow().Add(wait);
        while (true)
        {
            var got = await ReceiveOnceAsync(queue, max, visibility, cancellationToken);
            if (got.Count > 0 || clock.GetUtcNow() >= deadline)
            {
                return got;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(250), clock, cancellationToken);
        }
    }

    private async Task<IReadOnlyList<QueueMessage>> ReceiveOnceAsync(string queue, int max, TimeSpan visibility, CancellationToken cancellationToken)
    {
        await using var db = await contexts.CreateDbContextAsync(cancellationToken);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var now = clock.GetUtcNow();
        var rows = await db.LocalQueueMessages
            .FromSqlInterpolated($"""
                SELECT * FROM evidence.local_queue_messages
                WHERE queue = {queue} AND visible_at_utc <= {now}
                ORDER BY created_at_utc
                LIMIT {Math.Clamp(max, 1, 10)}
                FOR UPDATE SKIP LOCKED
                """)
            .ToListAsync(cancellationToken);
        var result = new List<QueueMessage>();
        foreach (var row in rows)
        {
            row.ReceiveCount++;
            if (row.ReceiveCount > options.MaxReceiveCount)
            {
                row.Queue = DeadLetterOf(queue); // redrive policy: kept for inspection, not processed again
                row.ReceiveCount = 0;
                continue;
            }

            row.VisibleAtUtc = now.Add(visibility);
            row.ReceiptHandle = Guid.NewGuid().ToString("N");
            result.Add(new QueueMessage(queue, row.Id.ToString("N"), row.ReceiptHandle, row.Body, row.ReceiveCount));
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    public async Task DeleteAsync(QueueMessage message, CancellationToken cancellationToken)
    {
        await using var db = await contexts.CreateDbContextAsync(cancellationToken);
        var id = Guid.ParseExact(message.MessageId, "N");
        await db.LocalQueueMessages
            .Where(m => m.Id == id && m.ReceiptHandle == message.ReceiptHandle)
            .ExecuteDeleteAsync(cancellationToken);
    }

    public async Task ReleaseAsync(QueueMessage message, TimeSpan delay, CancellationToken cancellationToken)
    {
        await using var db = await contexts.CreateDbContextAsync(cancellationToken);
        var id = Guid.ParseExact(message.MessageId, "N");
        var visible = clock.GetUtcNow().Add(delay);
        await db.LocalQueueMessages
            .Where(m => m.Id == id && m.ReceiptHandle == message.ReceiptHandle)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.VisibleAtUtc, visible), cancellationToken);
    }
}
