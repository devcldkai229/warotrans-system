using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Documents;

public sealed class IssueReport
{
    [BsonId]
    public Guid Id { get; set; }

    public Guid ReportedBy { get; set; }
    public Guid? ContainerId { get; set; }
    public Guid? TransportRequestId { get; set; }
    public Guid? JobId { get; set; }
    public Guid? JobStepId { get; set; }
    public Guid? StorageLocationId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public IssueType IssueType { get; set; }

    [BsonRepresentation(BsonType.String)]
    public IssueSeverity Severity { get; set; }

    [BsonRepresentation(BsonType.String)]
    public IssueStatus Status { get; set; }

    public string Description { get; set; } = string.Empty;
    public List<EvidenceItem> Evidence { get; set; } = [];
    public BsonDocument Metadata { get; set; } = new();
    public DateTimeOffset ReportedAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
    public Guid? ResolvedBy { get; set; }
    public string? Resolution { get; set; }
}
