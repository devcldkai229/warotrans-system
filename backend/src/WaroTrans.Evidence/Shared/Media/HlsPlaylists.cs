using System.Globalization;

namespace WaroTrans.Evidence.Media;

/// <summary>The bits of HLS the Worker checks before calling an asset READY (spec §5.2: READY only from real output).</summary>
public static class HlsPlaylists
{
    public sealed record Variant(string Uri, int? Width, int? Height, long? Bandwidth);

    public sealed record MediaPlaylist(IReadOnlyList<string> Segments, double DurationSeconds, bool Ended);

    public static IReadOnlyList<Variant> ParseMaster(string text)
    {
        var lines = Lines(text);
        if (lines.Count == 0 || lines[0] != "#EXTM3U")
        {
            throw new FormatException("not an HLS playlist");
        }

        var variants = new List<Variant>();
        for (var i = 0; i < lines.Count; i++)
        {
            if (!lines[i].StartsWith("#EXT-X-STREAM-INF:", StringComparison.Ordinal))
            {
                continue;
            }

            var attrs = Attributes(lines[i]["#EXT-X-STREAM-INF:".Length..]);
            int? w = null, h = null;
            if (attrs.TryGetValue("RESOLUTION", out var res) && res.Split('x') is [var ws, var hs]
                && int.TryParse(ws, out var wv) && int.TryParse(hs, out var hv))
            {
                (w, h) = (wv, hv);
            }

            long? bw = attrs.TryGetValue("BANDWIDTH", out var b) && long.TryParse(b, out var bv) ? bv : null;
            var uri = lines.Skip(i + 1).FirstOrDefault(l => !l.StartsWith('#'));
            if (uri is not null)
            {
                variants.Add(new Variant(uri, w, h, bw));
            }
        }

        return variants;
    }

    public static MediaPlaylist ParseMedia(string text)
    {
        var lines = Lines(text);
        if (lines.Count == 0 || lines[0] != "#EXTM3U")
        {
            throw new FormatException("not an HLS playlist");
        }

        var segments = new List<string>();
        double total = 0;
        for (var i = 0; i < lines.Count; i++)
        {
            if (lines[i].StartsWith("#EXTINF:", StringComparison.Ordinal))
            {
                var value = lines[i]["#EXTINF:".Length..].Split(',')[0];
                total += double.Parse(value, CultureInfo.InvariantCulture);
                var uri = lines.Skip(i + 1).FirstOrDefault(l => !l.StartsWith('#'));
                if (uri is not null)
                {
                    segments.Add(uri);
                }
            }
        }

        return new MediaPlaylist(segments, total, lines.Contains("#EXT-X-ENDLIST"));
    }

    /// <summary>A URI of a playlist resolved against the playlist's own key ("720p/index.m3u8" next to master).</summary>
    public static string Resolve(string playlistKey, string uri)
    {
        var folder = playlistKey.Contains('/') ? playlistKey[..(playlistKey.LastIndexOf('/') + 1)] : string.Empty;
        var parts = new List<string>((folder + uri).Split('/'));
        for (var i = 0; i < parts.Count; i++)
        {
            if (parts[i] == "..")
            {
                parts.RemoveAt(i);
                if (i > 0)
                {
                    parts.RemoveAt(i - 1);
                    i--;
                }

                i--;
            }
        }

        return string.Join('/', parts);
    }

    private static List<string> Lines(string text) =>
        text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();

    private static Dictionary<string, string> Attributes(string list)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var i = 0;
        while (i < list.Length)
        {
            var eq = list.IndexOf('=', i);
            if (eq < 0)
            {
                break;
            }

            var name = list[i..eq].Trim();
            string value;
            int next;
            if (eq + 1 < list.Length && list[eq + 1] == '"')
            {
                var close = list.IndexOf('"', eq + 2);
                value = list[(eq + 2)..close];
                next = list.IndexOf(',', close);
            }
            else
            {
                next = list.IndexOf(',', eq);
                value = next < 0 ? list[(eq + 1)..] : list[(eq + 1)..next];
            }

            result[name] = value;
            if (next < 0)
            {
                break;
            }

            i = next + 1;
        }

        return result;
    }
}
