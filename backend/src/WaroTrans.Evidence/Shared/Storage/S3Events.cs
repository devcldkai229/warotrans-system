using System.Text.Json;
using System.Text.Json.Nodes;

namespace WaroTrans.Evidence.Storage;

/// <summary>One object reported by an S3 ObjectCreated notification (or the local store's imitation of one).</summary>
public sealed record S3ObjectEvent(string EventName, string Bucket, string Key, long Size, string? ETag, string? VersionId);

/// <summary>Reads and (for the local store) writes the S3 event notification format.</summary>
public static class S3Events
{
    /// <returns>The records; empty for <c>s3:TestEvent</c> or anything that is not an S3 notification.</returns>
    public static IReadOnlyList<S3ObjectEvent> Parse(string body)
    {
        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        // SNS-wrapped notifications carry the S3 JSON as a string in "Message".
        if (root.TryGetProperty("Message", out var wrapped) && wrapped.ValueKind == JsonValueKind.String)
        {
            return Parse(wrapped.GetString()!);
        }

        if (!root.TryGetProperty("Records", out var records) || records.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var result = new List<S3ObjectEvent>();
        foreach (var record in records.EnumerateArray())
        {
            var name = record.TryGetProperty("eventName", out var n) ? n.GetString() ?? "" : "";
            if (!name.StartsWith("ObjectCreated", StringComparison.Ordinal) || !record.TryGetProperty("s3", out var s3))
            {
                continue;
            }

            var bucket = s3.GetProperty("bucket").GetProperty("name").GetString() ?? "";
            var obj = s3.GetProperty("object");
            // S3 URL-encodes keys in notifications, with '+' for spaces.
            var key = Uri.UnescapeDataString((obj.GetProperty("key").GetString() ?? "").Replace('+', ' '));
            var size = obj.TryGetProperty("size", out var s) && s.TryGetInt64(out var bytes) ? bytes : -1;
            var etag = obj.TryGetProperty("eTag", out var e) ? e.GetString() : null;
            var version = obj.TryGetProperty("versionId", out var v) ? v.GetString() : null;
            result.Add(new S3ObjectEvent(name, bucket, key, size, etag, version));
        }

        return result;
    }

    public static string ObjectCreated(StoredObject stored, DateTimeOffset at) =>
        new JsonObject
        {
            ["Records"] = new JsonArray(new JsonObject
            {
                ["eventVersion"] = "2.1",
                ["eventSource"] = "warotrans:local-store",
                ["eventTime"] = at.ToString("O"),
                ["eventName"] = "ObjectCreated:Put",
                ["s3"] = new JsonObject
                {
                    ["bucket"] = new JsonObject { ["name"] = stored.Bucket },
                    ["object"] = new JsonObject
                    {
                        ["key"] = Uri.EscapeDataString(stored.Key).Replace("%2F", "/"),
                        ["size"] = stored.Size,
                        ["eTag"] = stored.ETag
                    }
                }
            })
        }.ToJsonString();
}
