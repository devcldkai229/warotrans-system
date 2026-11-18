using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Queues;

namespace WaroTrans.Evidence.Worker.Services;

/// <summary>What became of one message.</summary>
public enum MessageOutcome
{
    /// <summary>Done and saved: delete it.</summary>
    Done,

    /// <summary>Not yet (the data it needs is not there, a transient error): it comes back after a backoff.</summary>
    Retry,

    /// <summary>Never processable: delete it (it was logged). Real poison goes to the DLQ through Retry + max receives.</summary>
    Drop
}

public interface IQueueMessageHandler
{
    string Queue { get; }

    Task<MessageOutcome> HandleAsync(QueueMessage message, CancellationToken cancellationToken);
}

public sealed class WorkerOptions
{
    public const string SectionName = "Evidence:Worker";

    public int ReceiveBatch { get; set; } = 10;
    public int WaitSeconds { get; set; } = 20;
    public int VisibilitySeconds { get; set; } = 120;
    public Dictionary<string, int> Concurrency { get; set; } = new(StringComparer.Ordinal)
    {
        ["segment-ingest"] = 4,
        ["media-process"] = 1,
        ["media-result"] = 2
    };

    public int ReconcileIntervalSeconds { get; set; } = 600;
    public int OutboxIntervalMs { get; set; } = 1000;
}

/// <summary>
/// Long-polls one queue (spec §8.3): a message is deleted only after its work is durably saved; a transient failure
/// comes back after an exponential backoff on its receive count (SQS sends it to the DLQ after the maximum). Several
/// loops per queue give the configured concurrency.
/// </summary>
public sealed class QueueConsumer<THandler>(
    IServiceScopeFactory scopes,
    IWorkQueue queue,
    IOptions<WorkerOptions> options,
    ILogger<QueueConsumer<THandler>> logger) : BackgroundService
    where THandler : IQueueMessageHandler
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        string name;
        using (var scope = scopes.CreateScope())
        {
            name = scope.ServiceProvider.GetRequiredService<THandler>().Queue;
        }

        var loops = Math.Max(1, options.Value.Concurrency.GetValueOrDefault(name, 1));
        return Task.WhenAll(Enumerable.Range(0, loops).Select(_ => LoopAsync(name, stoppingToken)));
    }

    private async Task LoopAsync(string name, CancellationToken stoppingToken)
    {
        var o = options.Value;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var messages = await queue.ReceiveAsync(name, o.ReceiveBatch, TimeSpan.FromSeconds(o.WaitSeconds),
                    TimeSpan.FromSeconds(o.VisibilitySeconds), stoppingToken);
                foreach (var message in messages)
                {
                    await HandleOneAsync(message, stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Evidence worker: receiving from {Queue} failed", name);
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    public async Task<MessageOutcome> HandleOneAsync(QueueMessage message, CancellationToken cancellationToken)
    {
        MessageOutcome outcome;
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            outcome = await scope.ServiceProvider.GetRequiredService<THandler>().HandleAsync(message, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Evidence worker: {Queue} message {MessageId} failed (receive {Count})", message.Queue, message.MessageId, message.ReceiveCount);
            outcome = MessageOutcome.Retry;
        }

        if (outcome == MessageOutcome.Retry)
        {
            await queue.ReleaseAsync(message, Backoff(message.ReceiveCount), cancellationToken);
        }
        else
        {
            await queue.DeleteAsync(message, cancellationToken);
        }

        return outcome;
    }

    public static TimeSpan Backoff(int receiveCount) => TimeSpan.FromSeconds(Math.Min(300, 5 * Math.Pow(2, Math.Max(0, receiveCount - 1))));
}
