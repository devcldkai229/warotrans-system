using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MongoDB.Bson;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations.Features.ListAuditLogs;

public sealed record AuditLogDto(
    Guid Id,
    DateTimeOffset OccurredAt,
    Guid? ActorAccountId,
    string? ActorUsername,
    string? ActorRole,
    string Action,
    string EntityType,
    Guid? EntityId,
    string? Reason,
    object? Before,
    object? After,
    object? Context,
    string? CorrelationId,
    string? SourceIp);

public sealed record ListAuditLogsResponse(long Total, IReadOnlyList<AuditLogDto> Items);

public sealed record ListAuditLogsQuery(
    Guid? ActorId,
    string? EntityType,
    Guid? EntityId,
    string? Action,
    DateTimeOffset? From,
    DateTimeOffset? To,
    int Skip,
    int Take);

public sealed class ListAuditLogsHandler(
    OperationsMongoContext mongo,
    ICurrentUser currentUser,
    IRobotAccessScope robotAccessScope)
{
    public const int MaxTake = 200;

    public async Task<ListAuditLogsResponse> HandleAsync(ListAuditLogsQuery query, CancellationToken cancellationToken)
    {
        var f = Builders<AuditLog>.Filter;
        var filters = new List<FilterDefinition<AuditLog>>();

        if (query.ActorId is { } actor) filters.Add(f.Eq(a => a.ActorAccountId, actor));
        if (!string.IsNullOrWhiteSpace(query.EntityType)) filters.Add(f.Eq(a => a.Entity.Type, query.EntityType.Trim().ToUpperInvariant()));
        if (query.EntityId is { } entityId) filters.Add(f.Eq(a => a.Entity.Id, entityId));
        if (!string.IsNullOrWhiteSpace(query.Action)) filters.Add(f.Regex(a => a.Action, new BsonRegularExpression("^" + System.Text.RegularExpressions.Regex.Escape(query.Action.Trim()))));
        if (query.From is { } from) filters.Add(f.Gte(a => a.OccurredAt, from.UtcDateTime));
        if (query.To is { } to) filters.Add(f.Lte(a => a.OccurredAt, to.UtcDateTime));

        // A Technician reads the trail of their robots and their own actions, not the whole system.
        var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
        if (!scope.AllRobots)
        {
            var robots = scope.RobotIds.ToList();
            filters.Add(f.Or(
                f.And(f.Eq(a => a.Entity.Type, "ROBOT"), f.In(a => a.Entity.Id, robots)),
                f.Eq(a => a.ActorAccountId, currentUser.AccountId)));
        }

        var filter = filters.Count == 0 ? f.Empty : f.And(filters);
        var total = await mongo.AuditLogs.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var items = await mongo.AuditLogs.Find(filter)
            .SortByDescending(a => a.OccurredAt)
            .Skip(Math.Max(0, query.Skip))
            .Limit(Math.Clamp(query.Take, 1, MaxTake))
            .ToListAsync(cancellationToken);

        return new ListAuditLogsResponse(total, items.Select(ToDto).ToList());
    }

    private static AuditLogDto ToDto(AuditLog a) => new(
        a.Id,
        new DateTimeOffset(DateTime.SpecifyKind(a.OccurredAt, DateTimeKind.Utc)),
        a.ActorAccountId,
        a.ActorUsername,
        a.ActorRole,
        a.Action,
        a.Entity.Type,
        a.Entity.Id == Guid.Empty ? null : a.Entity.Id,
        a.Reason,
        ToPlain(a.Before),
        ToPlain(a.After),
        ToPlain(a.Context),
        a.CorrelationId,
        a.SourceIp);

    private static object? ToPlain(BsonDocument? document) =>
        document is null ? null : BsonTypeMapper.MapToDotNetValue(document);
}

public static class ListAuditLogsEndpoint
{
    public static RouteGroupBuilder MapListAuditLogs(this RouteGroupBuilder group)
    {
        group.MapGet("/audit-logs", async (
                Guid? actorId,
                string? entityType,
                Guid? entityId,
                string? action,
                DateTimeOffset? from,
                DateTimeOffset? to,
                int? skip,
                int? take,
                ListAuditLogsHandler handler,
                CancellationToken cancellationToken) =>
                Results.Ok(await handler.HandleAsync(
                    new ListAuditLogsQuery(actorId, entityType, entityId, action, from, to, skip ?? 0, take ?? 50),
                    cancellationToken)))
            .RequirePermission(Permissions.AuditRead)
            .WithName("ListAuditLogs")
            .WithSummary("Who did what, newest first")
            .WithDescription("`action` matches a prefix (e.g. `account.` for every account change). A Technician only sees entries about the robots assigned to them and their own actions.");

        return group;
    }
}
