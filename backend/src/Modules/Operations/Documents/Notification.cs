using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Documents;

public sealed class Notification
{
    [BsonId]
    public Guid Id { get; set; }

    public Guid ReceiverAccountId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public NotificationType Type { get; set; }

    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public RelatedEntityRef? RelatedEntity { get; set; }
    public BsonDocument Metadata { get; set; } = new();
    public bool IsRead { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}
