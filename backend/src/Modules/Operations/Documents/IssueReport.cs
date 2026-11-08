using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Documents;

/// <summary>A problem someone reported (OPS-01): a damaged container, a blocked path, a robot fault.</summary>
public sealed class IssueReport
{
    [BsonId]
    public Guid Id { get; set; }

    /// <summary>Short human code, e.g. <c>ISS-1A2B3C4D</c>.</summary>
    public string Code { get; set; } = string.Empty;

    public Guid ReportedBy { get; set; }
    public Guid? ContainerId { get; set; }
    public Guid? TransportRequestId { get; set; }
    public Guid? JobId { get; set; }
    public Guid? JobStepId { get; set; }
    public Guid? StorageLocationId { get; set; }
    public Guid? RobotId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public IssueType IssueType { get; set; }

    [BsonRepresentation(BsonType.String)]
    public IssueSeverity Severity { get; set; }

    [BsonRepresentation(BsonType.String)]
    public IssueStatus Status { get; set; }

    public string Description { get; set; } = string.Empty;
    public List<EvidenceItem> Evidence { get; set; } = [];
    public BsonDocument Metadata { get; set; } = new();

    public Guid? AssigneeId { get; set; }

    /// <summary>"step:{jobStepId}" when a workflow step raised it: unique, so a retried step never opens a second issue.</summary>
    public string? SourceKey { get; set; }

    /// <summary>Optimistic concurrency: every change must name the version it was based on.</summary>
    public int Version { get; set; }

    public DateTimeOffset ReportedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
    public Guid? ResolvedBy { get; set; }
    public string? Resolution { get; set; }
}
