using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations.Services;

public sealed class AuditOptions
{
    public const string SectionName = "Operations:Audit";

    /// <summary>How long an entry is kept before the TTL index removes it.</summary>
    public int RetentionDays { get; set; } = 365;
}

public sealed class MongoAuditTrail(
    OperationsMongoContext mongo,
    ICurrentUser currentUser,
    IHttpContextAccessor httpContextAccessor,
    IOptions<AuditOptions> options,
    TimeProvider clock,
    ILogger<MongoAuditTrail> logger) : IAuditTrail
{
    private const int MaxUserAgentLength = 300;

    public async Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default)
    {
        try
        {
            var http = httpContextAccessor.HttpContext;
            var now = clock.GetUtcNow();
            var userAgent = http?.Request.Headers.UserAgent.ToString();

            var log = new AuditLog
            {
                Id = Guid.NewGuid(),
                ActorAccountId = currentUser.AccountId,
                ActorUsername = currentUser.Username,
                ActorRole = currentUser.Role,
                Action = entry.Action,
                Entity = new RelatedEntityRef { Type = entry.EntityType, Id = entry.EntityId ?? Guid.Empty },
                Before = ToBson(entry.Before),
                After = ToBson(entry.After),
                Reason = string.IsNullOrWhiteSpace(entry.Reason) ? null : entry.Reason.Trim(),
                Context = ToBson(entry.Context),
                CorrelationId = Activity.Current?.TraceId.ToString() ?? http?.TraceIdentifier,
                SourceIp = http?.Connection.RemoteIpAddress?.ToString(),
                UserAgent = string.IsNullOrEmpty(userAgent) ? null : userAgent[..Math.Min(userAgent.Length, MaxUserAgentLength)],
                OccurredAt = now.UtcDateTime,
                ExpireAt = now.UtcDateTime.AddDays(Math.Max(1, options.Value.RetentionDays))
            };

            // Not tied to the request: an aborted request must still leave its trace of what already happened.
            await mongo.AuditLogs.InsertOneAsync(log, cancellationToken: CancellationToken.None);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Could not write audit entry {Action} for {EntityType} {EntityId}",
                entry.Action, entry.EntityType, entry.EntityId);
        }
    }

    /// <summary>Through JSON so any value (records, enums, Guids) becomes plain BSON; secrets are dropped first.</summary>
    internal static BsonDocument? ToBson(IReadOnlyDictionary<string, object?>? values)
    {
        var safe = AuditRedaction.Redact(values);
        if (safe is null || safe.Count == 0)
        {
            return null;
        }

        var json = JsonSerializer.Serialize(safe, JsonOptions);
        return BsonDocument.Parse(json);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };
}
