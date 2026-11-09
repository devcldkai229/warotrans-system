using MongoDB.Driver;
using WaroTrans.Operations.Documents;

namespace WaroTrans.Operations.Persistence;

public sealed class OperationsMongoContext
{
    public const string IssueReportsCollection = "issue_reports";
    public const string NotificationsCollection = "notifications";
    public const string AuditLogsCollection = "audit_logs";

    public OperationsMongoContext(IMongoDatabase database)
    {
        Database = database;
    }

    public IMongoDatabase Database { get; }

    public IMongoCollection<IssueReport> IssueReports =>
        Database.GetCollection<IssueReport>(IssueReportsCollection);

    public IMongoCollection<Notification> Notifications =>
        Database.GetCollection<Notification>(NotificationsCollection);

    public IMongoCollection<AuditLog> AuditLogs =>
        Database.GetCollection<AuditLog>(AuditLogsCollection);

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken = default)
    {
        await IssueReports.Indexes.CreateManyAsync(
            [
                new CreateIndexModel<IssueReport>(
                    Builders<IssueReport>.IndexKeys.Ascending(x => x.Status)),
                new CreateIndexModel<IssueReport>(
                    Builders<IssueReport>.IndexKeys.Ascending(x => x.ReportedBy)),
                new CreateIndexModel<IssueReport>(
                    Builders<IssueReport>.IndexKeys.Descending(x => x.ReportedAt)),
                new CreateIndexModel<IssueReport>(
                    Builders<IssueReport>.IndexKeys.Ascending(x => x.JobId)),
                new CreateIndexModel<IssueReport>(
                    Builders<IssueReport>.IndexKeys.Ascending(x => x.TransportRequestId)),
                new CreateIndexModel<IssueReport>(
                    Builders<IssueReport>.IndexKeys.Ascending(x => x.AssigneeId)),
                new CreateIndexModel<IssueReport>(
                    Builders<IssueReport>.IndexKeys.Ascending(x => x.RobotId)),
                // A workflow step opens at most one issue, even when its confirmation is retried.
                new CreateIndexModel<IssueReport>(
                    Builders<IssueReport>.IndexKeys.Ascending(x => x.SourceKey),
                    new CreateIndexOptions<IssueReport>
                    {
                        Unique = true,
                        PartialFilterExpression = Builders<IssueReport>.Filter.Type(x => x.SourceKey, MongoDB.Bson.BsonType.String)
                    })
            ],
            cancellationToken);

        await Notifications.Indexes.CreateOneAsync(
            new CreateIndexModel<Notification>(
                Builders<Notification>.IndexKeys
                    .Ascending(x => x.ReceiverAccountId)
                    .Ascending(x => x.IsRead)
                    .Descending(x => x.CreatedAt)),
            cancellationToken: cancellationToken);

        await Notifications.Indexes.CreateOneAsync(
            new CreateIndexModel<Notification>(
                Builders<Notification>.IndexKeys.Ascending(x => x.DedupeKey).Descending(x => x.CreatedAt)),
            cancellationToken: cancellationToken);

        await Notifications.Indexes.CreateOneAsync(
            new CreateIndexModel<Notification>(
                Builders<Notification>.IndexKeys.Ascending(x => x.RecipientRoles).Descending(x => x.CreatedAt)),
            cancellationToken: cancellationToken);

        await AuditLogs.Indexes.CreateManyAsync(
            [
                new CreateIndexModel<AuditLog>(
                    Builders<AuditLog>.IndexKeys
                        .Ascending(x => x.Entity.Type)
                        .Ascending(x => x.Entity.Id)),
                new CreateIndexModel<AuditLog>(
                    Builders<AuditLog>.IndexKeys.Ascending(x => x.ActorAccountId)),
                new CreateIndexModel<AuditLog>(
                    Builders<AuditLog>.IndexKeys.Ascending(x => x.CorrelationId)),
                new CreateIndexModel<AuditLog>(
                    Builders<AuditLog>.IndexKeys.Descending(x => x.OccurredAt)),
                new CreateIndexModel<AuditLog>(
                    Builders<AuditLog>.IndexKeys.Ascending(x => x.Action)),
                // Retention: each entry carries its own expiry date (Operations:Audit:RetentionDays).
                new CreateIndexModel<AuditLog>(
                    Builders<AuditLog>.IndexKeys.Ascending(x => x.ExpireAt),
                    new CreateIndexOptions { ExpireAfter = TimeSpan.Zero })
            ],
            cancellationToken);
    }
}
