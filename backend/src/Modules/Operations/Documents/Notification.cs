using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Documents;

/// <summary>
/// A notification for one person (<see cref="ReceiverAccountId"/>) or for everyone holding one of
/// <see cref="RecipientRoles"/> (OPS-03). Read state is kept per person in <see cref="Reads"/>, so one admin reading
/// it no longer marks it read for the others.
/// </summary>
public sealed class Notification
{
    /// <summary><see cref="ReceiverAccountId"/> of a notification addressed to roles rather than to one person.</summary>
    public static readonly Guid EveryAdmin = Guid.Empty;

    [BsonId]
    public Guid Id { get; set; }

    public Guid ReceiverAccountId { get; set; }

    /// <summary>Roles that see it when it has no single receiver. Empty on documents written before OPS-03 = ADMIN.</summary>
    public List<string> RecipientRoles { get; set; } = [];

    /// <summary>The robot it is about; a Technician only sees robot notifications for robots in their scope.</summary>
    public Guid? RobotId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public NotificationType Type { get; set; }

    /// <summary>Machine name of the situation (<c>JOB_FAILED</c>, <c>ROBOT_OFFLINE</c> …); empty on older documents.</summary>
    public string Kind { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public RelatedEntityRef? RelatedEntity { get; set; }

    /// <summary>Client route that opens the entity (SY-04), e.g. <c>/monitor/jobs/{id}</c>.</summary>
    public string? Route { get; set; }

    public BsonDocument Metadata { get; set; } = new();

    /// <summary>Identifies the situation so repeats are dropped and a recovery can resolve it.</summary>
    public string? DedupeKey { get; set; }

    /// <summary>Legacy shared read flag (before OPS-03): when true the notification counts as read for everyone.</summary>
    public bool IsRead { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Legacy shared read time.</summary>
    public DateTimeOffset? ReadAt { get; set; }

    /// <summary>Who has read it, and when.</summary>
    public List<NotificationRead> Reads { get; set; } = [];

    /// <summary>Set when the situation is over (the robot came back, the job moved on).</summary>
    public DateTimeOffset? ResolvedAt { get; set; }
}

public sealed class NotificationRead
{
    public Guid AccountId { get; set; }
    public DateTimeOffset ReadAt { get; set; }
}
