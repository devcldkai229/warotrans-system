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
                    Builders<IssueReport>.IndexKeys.Ascending(x => x.TransportRequestId))
            ],
            cancellationToken);

        await Notifications.Indexes.CreateOneAsync(
            new CreateIndexModel<Notification>(
                Builders<Notification>.IndexKeys
                    .Ascending(x => x.ReceiverAccountId)
                    .Ascending(x => x.IsRead)
                    .Descending(x => x.CreatedAt)),
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
                    Builders<AuditLog>.IndexKeys.Descending(x => x.OccurredAt))
            ],
            cancellationToken);
    }
}
