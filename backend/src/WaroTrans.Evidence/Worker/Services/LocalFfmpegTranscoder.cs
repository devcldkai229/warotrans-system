using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Media;
using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Storage;

namespace WaroTrans.Evidence.Worker.Services;

/// <summary>
/// Development stand-in for MediaConvert (Evidence:Media:Provider = Local): ffmpeg stitches the group's AVI segments in
/// sequence order into HLS 720p + 480p next to the raw files, then reports on the media-result queue in the
/// EventBridge shape. Never used in production (spec: no transcoding server of our own).
/// </summary>
public sealed class LocalFfmpegTranscoder(
    EvidenceStorageOptions storage,
    IOptions<EvidenceMediaOptions> options,
    IWorkQueue queue,
    ILogger<LocalFfmpegTranscoder> logger) : IMediaTranscoder
{
    private const string Marker = "job.json";

    public string Provider => "LOCAL_FFMPEG";

    private sealed record MarkerFile(string ProviderJobId, Guid ProcessingJobId, string Status, string? Error, long? DurationMs);

    public Task<string> SubmitAsync(TranscodeRequest request, CancellationToken cancellationToken)
    {
        var outDir = Path.Combine(storage.LocalRootPath, request.OutputPrefix.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(outDir);
        var markerPath = Path.Combine(outDir, Marker);
        if (File.Exists(markerPath))
        {
            return Task.FromResult(JsonSerializer.Deserialize<MarkerFile>(File.ReadAllText(markerPath))!.ProviderJobId);
        }

        var jobId = "local-" + request.ProcessingJobId.ToString("N")[..12];
        WriteMarker(markerPath, new MarkerFile(jobId, request.ProcessingJobId, ProviderJobStatus.Submitted, null, null));
        _ = Task.Run(() => RunAsync(request, outDir, markerPath, jobId), CancellationToken.None);
        return Task.FromResult(jobId);
    }

    private async Task RunAsync(TranscodeRequest request, string outDir, string markerPath, string jobId)
    {
        var list = Path.Combine(outDir, "inputs.txt");
        await File.WriteAllLinesAsync(list, request.InputKeys.Select(k =>
            "file '" + Path.Combine(storage.LocalRootPath, k.Replace('/', Path.DirectorySeparatorChar)).Replace("'", "'\\''") + "'"));
        var gop = Math.Max(1, request.Fps * 2).ToString(CultureInfo.InvariantCulture);
        var seg = Math.Max(2, options.Value.HlsSegmentSeconds).ToString(CultureInfo.InvariantCulture);
        string[] args =
        [
            "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list,
            "-filter_complex", "[0:v]split=2[a][b];[a]scale=-2:720[v720];[b]scale=-2:480[v480]",
            "-map", "[v720]", "-c:v:0", "libx264", "-b:v:0", "2500k",
            "-map", "[v480]", "-c:v:1", "libx264", "-b:v:1", "1000k",
            "-preset", "veryfast", "-pix_fmt", "yuv420p", "-g", gop, "-keyint_min", gop, "-sc_threshold", "0",
            "-f", "hls", "-hls_time", seg, "-hls_playlist_type", "vod",
            "-hls_segment_filename", Path.Combine(outDir, "%v", "segment-%05d.ts"),
            "-master_pl_name", "master.m3u8", "-var_stream_map", "v:0,name:720p v:1,name:480p",
            Path.Combine(outDir, "%v", "index.m3u8")
        ];
        MediaJobStateChange result;
        try
        {
            // Absolute paths (a working directory this deep exceeds Windows' 260-character limit for a process).
            var psi = new ProcessStartInfo(options.Value.FfmpegPath) { RedirectStandardError = true, UseShellExecute = false };
            foreach (var a in args)
            {
                psi.ArgumentList.Add(a);
            }

            using var process = Process.Start(psi) ?? throw new InvalidOperationException("ffmpeg did not start");
            var stderr = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();
            if (process.ExitCode != 0)
            {
                result = new MediaJobStateChange(jobId, ProviderJobStatus.Error, request.ProcessingJobId, $"ffmpeg_{process.ExitCode}", Trim(stderr), null);
            }
            else
            {
                // ffmpeg on Windows writes the variant URIs with backslashes ("720p\index.m3u8"): HLS needs "/".
                var masterPath = Path.Combine(outDir, "master.m3u8");
                await File.WriteAllTextAsync(masterPath, (await File.ReadAllTextAsync(masterPath)).Replace('\\', '/'));
                var playlist = HlsPlaylists.ParseMedia(await File.ReadAllTextAsync(Path.Combine(outDir, "720p", "index.m3u8")));
                result = new MediaJobStateChange(jobId, ProviderJobStatus.Complete, request.ProcessingJobId, null, null,
                    (long)Math.Round(playlist.DurationSeconds * 1000));
            }
        }
        catch (Exception ex)
        {
            result = new MediaJobStateChange(jobId, ProviderJobStatus.Error, request.ProcessingJobId, "ffmpeg_failed", Trim(ex.Message), null);
        }

        WriteMarker(markerPath, new MarkerFile(jobId, request.ProcessingJobId, result.Status, result.ErrorMessage, result.OutputDurationMs));
        logger.LogInformation("Local transcode {Job}: {Status} {Error}", jobId, result.Status, result.ErrorMessage);
        await queue.SendAsync(EvidenceQueues.MediaResult, MediaJobEvents.Write(result), CancellationToken.None);
    }

    public Task<ProviderJob?> FindAsync(Guid processingJobId, CancellationToken cancellationToken)
    {
        var root = Path.Combine(storage.LocalRootPath, "playback");
        if (!Directory.Exists(root))
        {
            return Task.FromResult<ProviderJob?>(null);
        }

        var marker = Directory.EnumerateFiles(root, Marker, SearchOption.AllDirectories)
            .FirstOrDefault(p => p.Contains(processingJobId.ToString("N"), StringComparison.Ordinal));
        return Task.FromResult(marker is null ? null : ToJob(marker));
    }

    public Task<ProviderJob?> GetAsync(string providerJobId, CancellationToken cancellationToken)
    {
        var root = Path.Combine(storage.LocalRootPath, "playback");
        var marker = Directory.Exists(root)
            ? Directory.EnumerateFiles(root, Marker, SearchOption.AllDirectories)
                .FirstOrDefault(p => File.ReadAllText(p).Contains(providerJobId, StringComparison.Ordinal))
            : null;
        return Task.FromResult(marker is null ? null : ToJob(marker));
    }

    private static ProviderJob? ToJob(string markerPath)
    {
        var m = JsonSerializer.Deserialize<MarkerFile>(File.ReadAllText(markerPath));
        return m is null ? null : new ProviderJob(m.ProviderJobId, m.Status, m.ProcessingJobId, m.Error is null ? null : "ffmpeg", m.Error, m.DurationMs);
    }

    private static void WriteMarker(string path, MarkerFile marker)
    {
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(marker));
        File.Move(temp, path, overwrite: true);
    }

    private static string Trim(string text) => text.Length <= 1000 ? text : text[..1000];
}
