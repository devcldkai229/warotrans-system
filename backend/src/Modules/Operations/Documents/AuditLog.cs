using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace WaroTrans.Operations.Documents;

/// <summary>One traced action (SY-05 / OPS-02). Written by <c>MongoAuditTrail</c>, never edited afterwards.</summary>
public sealed class AuditLog
{
    [BsonId]
    public Guid Id { get; set; }

    public Guid? ActorAccountId { get; set; }
    public string? ActorUsername { get; set; }
    public string? ActorRole { get; set; }

    /// <summary><c>resource.verb</c>, e.g. <c>account.password_reset</c>.</summary>
    public string Action { get; set; } = string.Empty;

    public RelatedEntityRef Entity { get; set; } = new();
    public BsonDocument? Before { get; set; }
    public BsonDocument? After { get; set; }
    public string? Reason { get; set; }
    public BsonDocument? Context { get; set; }

    /// <summary>The request's trace id, to find every entry one request (or one command chain) produced.</summary>
    public string? CorrelationId { get; set; }

    public string? SourceIp { get; set; }
    public string? UserAgent { get; set; }
    /// <summary>UTC, stored as a BSON date so it can be filtered and sorted.</summary>
    [BsonDateTimeOptions(Kind = DateTimeKind.Utc)]
    public DateTime OccurredAt { get; set; }

    /// <summary>BSON date for the TTL index (retention); DateTimeOffset is stored as an array and cannot carry a TTL.</summary>
    public DateTime ExpireAt { get; set; }
}
