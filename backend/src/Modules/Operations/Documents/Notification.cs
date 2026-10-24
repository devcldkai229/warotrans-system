using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Documents;

public sealed class Notification
{
    /// <summary>
    /// <see cref="ReceiverAccountId"/> of a notification for every admin: one shared inbox, so one admin reading it
    /// marks it read for all of them.
    /// </summary>
    public static readonly Guid EveryAdmin = Guid.Empty;

    [BsonId]
    public Guid Id { get; set; }

    public Guid ReceiverAccountId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public NotificationType Type { get; set; }

    /// <summary>Machine name of the situation (<c>JOB_FAILED</c>, <c>ROBOT_OFFLINE</c> …); empty on older documents.</summary>
    public string Kind { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public RelatedEntityRef? RelatedEntity { get; set; }
    public BsonDocument Metadata { get; set; } = new();

    /// <summary>Identifies the situation so repeats are dropped and a recovery can resolve it.</summary>
    public string? DedupeKey { get; set; }

    public bool IsRead { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }

    /// <summary>Set when the situation is over (the robot came back, the job moved on).</summary>
    public DateTimeOffset? ResolvedAt { get; set; }
}
