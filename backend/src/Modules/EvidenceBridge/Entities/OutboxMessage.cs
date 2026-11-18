namespace WaroTrans.EvidenceBridge.Entities;

/// <summary>
/// One integration event waiting to reach the Evidence Recorder (docs/adr/0012). Written when the in-process event is
/// handled, delivered at least once by <c>EvidenceOutboxRelay</c>; the Recorder drops duplicates by <see cref="Id"/>.
/// </summary>
public sealed class OutboxMessage
{
    /// <summary>The source event's EventId.</summary>
    public Guid Id { get; set; }

    public string EventType { get; set; } = string.Empty;
    public short SchemaVersion { get; set; }

    /// <summary>The whole envelope as sent (jsonb).</summary>
    public string Payload { get; set; } = "{}";

    public DateTimeOffset OccurredAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
    public int AttemptCount { get; set; }
    public DateTimeOffset? NextAttemptAt { get; set; }

    /// <summary>Last delivery error, or why the Recorder refused the event (then it is not sent again).</summary>
    public string? LastError { get; set; }
}
