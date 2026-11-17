using System.Text.Json;
using System.Text.Json.Nodes;

namespace WaroTrans.Evidence.Media;

/// <summary>
/// The "MediaConvert Job State Change" event as EventBridge delivers it to the media-result queue. The local
/// transcoder writes the same shape, so one parser serves both.
/// </summary>
public static class MediaJobEvents
{
    public const string ProcessingJobIdKey = "processingJobId";

    /// <returns>Null for anything that is not a job state change.</returns>
    public static MediaJobStateChange? Parse(string body)
    {
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        if (!root.TryGetProperty("detail", out var detail) || detail.ValueKind != JsonValueKind.Object
            || !detail.TryGetProperty("jobId", out var jobId) || !detail.TryGetProperty("status", out var status))
        {
            return null;
        }

        Guid? processingJobId = detail.TryGetProperty("userMetadata", out var meta) && meta.ValueKind == JsonValueKind.Object
                                && meta.TryGetProperty(ProcessingJobIdKey, out var p) && Guid.TryParse(p.GetString(), out var id)
            ? id
            : null;
        long? duration = null;
        if (detail.TryGetProperty("outputGroupDetails", out var groups) && groups.ValueKind == JsonValueKind.Array)
        {
            foreach (var g in groups.EnumerateArray())
            {
                if (g.TryGetProperty("outputDetails", out var outs) && outs.ValueKind == JsonValueKind.Array)
                {
                    foreach (var o in outs.EnumerateArray())
                    {
                        if (o.TryGetProperty("durationInMs", out var d) && d.TryGetInt64(out var ms))
                        {
                            duration = duration is null ? ms : Math.Min(duration.Value, ms);
                        }
                    }
                }
            }
        }

        return new MediaJobStateChange(
            jobId.GetString() ?? string.Empty,
            status.GetString() ?? string.Empty,
            processingJobId,
            detail.TryGetProperty("errorCode", out var code) ? code.ToString() : null,
            detail.TryGetProperty("errorMessage", out var msg) ? msg.GetString() : null,
            duration);
    }

    public static string Write(MediaJobStateChange change) =>
        new JsonObject
        {
            ["source"] = "warotrans.local-transcoder",
            ["detail-type"] = "MediaConvert Job State Change",
            ["detail"] = new JsonObject
            {
                ["jobId"] = change.ProviderJobId,
                ["status"] = change.Status,
                ["userMetadata"] = new JsonObject { [ProcessingJobIdKey] = change.ProcessingJobId?.ToString() },
                ["errorCode"] = change.ErrorCode,
                ["errorMessage"] = change.ErrorMessage,
                ["outputGroupDetails"] = change.OutputDurationMs is { } ms
                    ? new JsonArray(new JsonObject { ["outputDetails"] = new JsonArray(new JsonObject { ["durationInMs"] = ms }) })
                    : new JsonArray()
            }
        }.ToJsonString();
}
