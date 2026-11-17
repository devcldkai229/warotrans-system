using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Recorder.Services;

namespace WaroTrans.Evidence.Recorder.Features.Integrations.IngestTransportEvents;

/// <summary>POST /api/evidence/integrations/transport-events: the monolith's EvidenceBridge pushes a batch (service token).</summary>
internal static class IngestTransportEventsEndpoint
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static void Map(RouteGroupBuilder group) =>
        group.MapPost("/integrations/transport-events", async (
                TransportEventBatch batch,
                IngestTransportEventsHandler handler,
                IOptions<RecorderOptions> options,
                CancellationToken cancellationToken) =>
            {
                if (batch.Events is null || batch.Events.Count > options.Value.MaxBatchEvents)
                {
                    return Results.Problem(statusCode: StatusCodes.Status400BadRequest,
                        title: $"A batch holds 1 to {options.Value.MaxBatchEvents} events.");
                }

                return Results.Ok(await handler.HandleAsync(batch, cancellationToken));
            })
            .AllowAnonymous()
            .AddEndpointFilter<ServiceTokenFilter>()
            .WithName("IngestTransportEvents")
            .WithSummary("Integration events from the WaroTrans monolith (at least once; duplicates ignored).");
}
