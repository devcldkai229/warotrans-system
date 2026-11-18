namespace WaroTrans.Evidence.Queues;

/// <summary>
/// The three work queues of spec §8.1. AWS: SQS Standard, each with its DLQ (at least once, any order). Local: a
/// Postgres table with the same semantics (visibility timeout, receive count, dead-letter after
/// <see cref="EvidenceQueueOptions.MaxReceiveCount"/>). No video bytes ever go on a queue.
/// </summary>
public interface IWorkQueue
{
    Task SendAsync(string queue, string body, CancellationToken cancellationToken);

    /// <summary>Long-polls up to <paramref name="wait"/>; a received message is hidden for <paramref name="visibility"/>.</summary>
    Task<IReadOnlyList<QueueMessage>> ReceiveAsync(string queue, int max, TimeSpan wait, TimeSpan visibility, CancellationToken cancellationToken);

    /// <summary>Done for good (only after the work is durably saved).</summary>
    Task DeleteAsync(QueueMessage message, CancellationToken cancellationToken);

    /// <summary>Not now: visible again after <paramref name="delay"/> (transient failure, backoff).</summary>
    Task ReleaseAsync(QueueMessage message, TimeSpan delay, CancellationToken cancellationToken);
}

/// <param name="ReceiveCount">How many times it was received, this time included.</param>
public sealed record QueueMessage(string Queue, string MessageId, string ReceiptHandle, string Body, int ReceiveCount);

public static class EvidenceQueues
{
    /// <summary>S3 ObjectCreated of raw segments.</summary>
    public const string SegmentIngest = "segment-ingest";

    /// <summary>MediaProcessRequested from the Evidence outbox.</summary>
    public const string MediaProcess = "media-process";

    /// <summary>MediaConvert job state changes routed by EventBridge.</summary>
    public const string MediaResult = "media-result";

    public static readonly IReadOnlyList<string> All = [SegmentIngest, MediaProcess, MediaResult];
}

public sealed class EvidenceQueueOptions
{
    public const string SectionName = "Evidence:Queues";

    /// <summary>Local or Sqs.</summary>
    public string Provider { get; set; } = "Local";

    /// <summary>Sqs: logical queue name → queue URL.</summary>
    public Dictionary<string, string> Urls { get; set; } = new(StringComparer.Ordinal);

    public string Region { get; set; } = "ap-southeast-1";
    public string? ServiceUrl { get; set; }

    /// <summary>Local: after this many receives a message moves to "{queue}-dlq" (SQS: the redrive policy).</summary>
    public int MaxReceiveCount { get; set; } = 5;

    public bool IsSqs => string.Equals(Provider, "Sqs", StringComparison.OrdinalIgnoreCase);
}
