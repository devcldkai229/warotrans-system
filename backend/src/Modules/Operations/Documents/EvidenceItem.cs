using MongoDB.Bson;

namespace WaroTrans.Operations.Documents;

public sealed class EvidenceItem
{
    public string Kind { get; set; } = string.Empty;
    public string? Uri { get; set; }
    public string? MimeType { get; set; }
    public BsonDocument? Data { get; set; }
}
