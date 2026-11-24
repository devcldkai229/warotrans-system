using System.Collections.Concurrent;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;

namespace WaroTrans.Fleet.Features.Mapping;

/// <summary>The newest live view of a mapping robot: its pose, and the newest map it sent (not in every message).</summary>
public sealed record MappingPreview(
    string SessionId,
    long Seq,
    JsonElement? Pose,
    JsonElement? Map,
    string? State,
    double? ElapsedSec,
    DateTimeOffset ReceivedAt,
    DateTimeOffset? MapReceivedAt);

/// <summary>A finished map, every chunk in and its sha256 checked.</summary>
public sealed record MappingUpload(
    string SessionId,
    byte[] Pgm,
    string Yaml,
    int Width,
    int Height,
    double Resolution,
    double? KnownAreaM2 = null,
    string? RobotPath = null);

/// <summary>
/// In memory, per robot (live view) and per session (chunks of the finished map). Lost on restart, which is fine: the
/// live view refreshes every second and the robot keeps the finished map on disk (robotPath).
/// </summary>
public sealed class MappingLiveStore(TimeProvider clock)
{
    private const int MaxChunks = 2000;
    private const long MaxBlobBytes = 64L * 1024 * 1024;

    private readonly ConcurrentDictionary<string, MappingPreview> _previews = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, PendingUpload> _uploads = new(StringComparer.OrdinalIgnoreCase);

    public void PutPreview(string robotCode, string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var sessionId = root.TryGetProperty("sessionId", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString()! : string.Empty;
        var now = clock.GetUtcNow();
        JsonElement? pose = root.TryGetProperty("pose", out var p) && p.ValueKind == JsonValueKind.Object ? p.Clone() : null;
        JsonElement? map = root.TryGetProperty("map", out var m) && m.ValueKind == JsonValueKind.Object ? m.Clone() : null;
        var seq = root.TryGetProperty("seq", out var q) && q.TryGetInt64(out var seqValue) ? seqValue : 0;
        var state = root.TryGetProperty("state", out var st) && st.ValueKind == JsonValueKind.String ? st.GetString() : null;
        double? elapsed = root.TryGetProperty("elapsedSec", out var e) && e.TryGetDouble(out var el) ? el : null;

        _previews.AddOrUpdate(
            robotCode,
            _ => new MappingPreview(sessionId, seq, pose, map, state, elapsed, now, map is null ? null : now),
            (_, old) =>
            {
                var sameSession = string.Equals(old.SessionId, sessionId, StringComparison.OrdinalIgnoreCase);
                var keptMap = map ?? (sameSession ? old.Map : null);
                var keptAt = map is not null ? now : sameSession ? old.MapReceivedAt : null;
                return new MappingPreview(sessionId, seq, pose, keptMap, state, elapsed, now, keptAt);
            });
    }

    public MappingPreview? GetPreview(string robotCode, Guid sessionId) =>
        _previews.TryGetValue(robotCode, out var preview)
        && string.Equals(preview.SessionId, sessionId.ToString(), StringComparison.OrdinalIgnoreCase)
            ? preview
            : null;

    public void Forget(string robotCode) => _previews.TryRemove(robotCode, out _);

    /// <summary>
    /// Adds one chunk. Returns the whole map once the last chunk is in (and forgets the chunks); null while some are
    /// missing. Throws <see cref="InvalidDataException"/> when the chunks do not make up the announced map.
    /// </summary>
    public MappingUpload? AddChunk(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var sessionId = root.GetProperty("sessionId").GetString() ?? throw new InvalidDataException("sessionId missing");
        var index = root.GetProperty("index").GetInt32();
        var total = root.GetProperty("total").GetInt32();
        var sha = root.GetProperty("sha256").GetString() ?? string.Empty;
        if (total < 1 || total > MaxChunks || index < 0 || index >= total)
        {
            throw new InvalidDataException($"chunk {index}/{total} out of range");
        }

        var encoding = root.TryGetProperty("encoding", out var enc) ? enc.GetString() : null;
        if (encoding != "zlib+base64")
        {
            throw new InvalidDataException($"unsupported encoding {encoding}");
        }

        var data = Convert.FromBase64String(root.GetProperty("data").GetString() ?? string.Empty);
        var pending = _uploads.GetOrAdd(sessionId, _ => new PendingUpload(total, sha));
        lock (pending)
        {
            if (pending.Total != total || !string.Equals(pending.Sha256, sha, StringComparison.OrdinalIgnoreCase))
            {
                // A new attempt of the same session (finish retried): start over with it.
                pending.Reset(total, sha);
            }

            pending.Parts[index] = data;
            if (index == 0 || pending.Meta is null)
            {
                pending.Meta = root.Clone();
            }

            if (pending.Parts.Count < total)
            {
                return null;
            }

            _uploads.TryRemove(sessionId, out _);
            using var blob = new MemoryStream();
            for (var i = 0; i < total; i++)
            {
                blob.Write(pending.Parts[i]);
                if (blob.Length > MaxBlobBytes) throw new InvalidDataException("map too large");
            }

            var bytes = blob.ToArray();
            var actual = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            if (!string.Equals(actual, sha, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException("sha256 of the reassembled map does not match");
            }

            var pgm = Inflate(bytes);
            var meta = pending.Meta!.Value;
            return new MappingUpload(
                sessionId,
                pgm,
                meta.GetProperty("yaml").GetString() ?? string.Empty,
                meta.GetProperty("width").GetInt32(),
                meta.GetProperty("height").GetInt32(),
                meta.GetProperty("resolution").GetDouble(),
                meta.TryGetProperty("knownAreaM2", out var area) && area.TryGetDouble(out var a) ? a : null,
                meta.TryGetProperty("robotPath", out var path) && path.ValueKind == JsonValueKind.String ? path.GetString() : null);
        }
    }

    /// <summary>zlib stream (RFC 1950), as Python's zlib.compress writes it.</summary>
    public static byte[] Inflate(byte[] zlib)
    {
        using var input = new MemoryStream(zlib);
        using var inflater = new ZLibStream(input, CompressionMode.Decompress);
        using var output = new MemoryStream();
        var buffer = new byte[81920];
        int read;
        while ((read = inflater.Read(buffer, 0, buffer.Length)) > 0)
        {
            output.Write(buffer, 0, read);
            if (output.Length > MaxBlobBytes) throw new InvalidDataException("map too large");
        }

        return output.ToArray();
    }

    private sealed class PendingUpload(int total, string sha256)
    {
        public int Total { get; private set; } = total;
        public string Sha256 { get; private set; } = sha256;
        public Dictionary<int, byte[]> Parts { get; } = new();
        public JsonElement? Meta { get; set; }

        public void Reset(int total, string sha)
        {
            Total = total;
            Sha256 = sha;
            Parts.Clear();
            Meta = null;
        }
    }
}
