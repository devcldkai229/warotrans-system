using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace WaroTrans.Operations.Documents;

public sealed class AuditLog
{
    [BsonId]
    public Guid Id { get; set; }

    public Guid? ActorAccountId { get; set; }
    public string Action { get; set; } = string.Empty;
    public RelatedEntityRef Entity { get; set; } = new();
    public BsonDocument? Before { get; set; }
    public BsonDocument? After { get; set; }
    public BsonDocument? Context { get; set; }
    public Guid CorrelationId { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
}
