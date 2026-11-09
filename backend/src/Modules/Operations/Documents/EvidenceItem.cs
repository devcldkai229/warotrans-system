using MongoDB.Bson;

namespace WaroTrans.Operations.Documents;

/// <summary>Metadata of one piece of evidence (the file itself lives elsewhere; only its URI is kept).</summary>
public sealed class EvidenceItem
{
    /// <summary>PHOTO, VIDEO, NOTE, LINK or FILE.</summary>
    public string Kind { get; set; } = string.Empty;

    public string? Uri { get; set; }
    public string? MimeType { get; set; }
    public string? Note { get; set; }
    public Guid? AddedBy { get; set; }
    public DateTimeOffset? AddedAt { get; set; }
    public BsonDocument? Data { get; set; }
}
