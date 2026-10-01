using MongoDB.Bson.Serialization.Attributes;

namespace WaroTrans.Operations.Documents;

public sealed class RelatedEntityRef
{
    public string Type { get; set; } = string.Empty;

    [BsonElement("id")]
    public Guid Id { get; set; }
}
