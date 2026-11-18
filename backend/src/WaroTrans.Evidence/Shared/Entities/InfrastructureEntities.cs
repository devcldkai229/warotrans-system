namespace WaroTrans.Evidence.Entities;

/// <summary>An integration message already handled: the same message again is ignored (spec §4.14).</summary>
public sealed class EvidenceInbox
{
    public Guid Id { get; set; }
    public string MessageId { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string? EventType { get; set; }
    public short PayloadVersion { get; set; }
    public DateTimeOffset ProcessedAtUtc { get; set; }

    /// <summary>SHA-256 of the payload: the same id with other content is logged, not applied twice.</summary>
    public string Hash { get; set; } = string.Empty;
}

/// <summary>A message to put on a queue, written in the same transaction as the state it announces (spec §4.14).</summary>
public sealed class EvidenceOutbox
{
    public Guid Id { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Payload { get; set; } = "{}";
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public int AttemptCount { get; set; }
    public DateTimeOffset? NextAttemptAtUtc { get; set; }
    public string? LastError { get; set; }
}

/// <summary>A message of the Local queue provider (tests, offline dev): SQS semantics on a table.</summary>
public sealed class LocalQueueMessage
{
    public Guid Id { get; set; }
    public string Queue { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public DateTimeOffset VisibleAtUtc { get; set; }
    public int ReceiveCount { get; set; }
    public string? ReceiptHandle { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
}

/// <summary>
/// A robot's recording credential. Only the SHA-256 of the token is stored; the token is shown once when issued.
/// A robot may upload and report only for its own runs.
/// </summary>
public sealed class RobotCredential
{
    public Guid Id { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public string TokenSha256 { get; set; } = string.Empty;
    public Guid? IssuedBy { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset? LastUsedAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
}
