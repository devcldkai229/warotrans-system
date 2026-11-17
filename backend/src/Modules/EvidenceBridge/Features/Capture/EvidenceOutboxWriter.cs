using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.EvidenceBridge.Contracts;
using WaroTrans.EvidenceBridge.Entities;
using WaroTrans.EvidenceBridge.Persistence;

namespace WaroTrans.EvidenceBridge.Features.Capture;

/// <summary>Stores one envelope for the relay. The same EventId twice is stored once.</summary>
public sealed class EvidenceOutboxWriter(EvidenceBridgeDbContext db, TimeProvider clock)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public async Task WriteAsync(EvidenceEnvelope envelope, CancellationToken cancellationToken)
    {
        db.OutboxMessages.Add(new OutboxMessage
        {
            Id = envelope.EventId,
            EventType = envelope.EventType,
            SchemaVersion = (short)envelope.SchemaVersion,
            Payload = JsonSerializer.Serialize(envelope, Json),
            OccurredAt = envelope.OccurredAtUtc,
            CreatedAt = clock.GetUtcNow()
        });
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            db.ChangeTracker.Clear();
        }
    }
}
