extern alias worker;

using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.IntegrationTests.Infrastructure;
using WaroTrans.Evidence.Media;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Recorder.Features.Admin.IssueRobotCredential;
using WaroTrans.Evidence.Recorder.Features.Edge;
using WaroTrans.Evidence.Recorder.Features.Playback;
using WaroTrans.Evidence.Storage;
using EvidenceOutboxPublisher = worker::WaroTrans.Evidence.Worker.Features.OutboxPublisher.EvidenceOutboxPublisher;
using LocalFfmpegTranscoder = worker::WaroTrans.Evidence.Worker.Services.LocalFfmpegTranscoder;
using MediaResultHandler = worker::WaroTrans.Evidence.Worker.Features.MediaConvertResult.MediaResultHandler;
using MediaSubmissionHandler = worker::WaroTrans.Evidence.Worker.Features.MediaConvertSubmission.MediaSubmissionHandler;
using MessageOutcome = worker::WaroTrans.Evidence.Worker.Services.MessageOutcome;
using SegmentIngestionHandler = worker::WaroTrans.Evidence.Worker.Features.SegmentIngestion.SegmentIngestionHandler;
using WorkerOptions = worker::WaroTrans.Evidence.Worker.Services.WorkerOptions;

namespace WaroTrans.Evidence.IntegrationTests;

/// <summary>
/// Phase 3 end to end on the Local providers, with a real transcoder (ffmpeg standing in for MediaConvert): real MJPEG
/// AVI segments → verified → one job → HLS → output checked → PlaybackSpans → asset READY → audited, signed playback.
/// Skipped when ffmpeg is not installed.
/// </summary>
[Collection(RecorderCollection.Name)]
public sealed class MediaPipelineTests(RecorderFactory factory) : IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly DateTimeOffset _t0 = DateTimeOffset.UtcNow.AddMinutes(-5);
    private readonly Guid _robotSourceId = Guid.NewGuid();

    public Task InitializeAsync() => factory.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private static bool HasFfmpeg()
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo("ffmpeg", "-version") { RedirectStandardOutput = true, UseShellExecute = false });
            p!.WaitForExit(10_000);
            return p.ExitCode == 0;
        }
        catch (Exception)
        {
            return false;
        }
    }

    private static byte[] MakeMjpegAvi(string folder, int index, int seconds, int fps)
    {
        var path = Path.Combine(folder, $"seg{index}.avi");
        var psi = new ProcessStartInfo("ffmpeg") { UseShellExecute = false, RedirectStandardError = true };
        foreach (var a in new[] { "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", $"testsrc=size=320x240:rate={fps}",
                     "-t", seconds.ToString(), "-c:v", "mjpeg", "-q:v", "6", "-f", "avi", path })
        {
            psi.ArgumentList.Add(a);
        }

        using var p = Process.Start(psi)!;
        p.WaitForExit(30_000);
        Assert.Equal(0, p.ExitCode);
        return File.ReadAllBytes(path);
    }

    private async Task<T> DbAsync<T>(Func<EvidenceDbContext, Task<T>> read)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await read(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>());
    }

    private async Task<IReadOnlyList<QueueMessage>> ReceiveAsync(string queue, TimeSpan wait) =>
        await factory.Services.GetRequiredService<IWorkQueue>().ReceiveAsync(queue, 10, wait, TimeSpan.FromSeconds(60), CancellationToken.None);

    [Fact]
    public async Task Recorded_segments_become_playable_hls_with_measured_spans_and_a_signed_audited_grant()
    {
        if (!HasFfmpeg())
        {
            return; // nothing to transcode with on this machine
        }

        // A run for RBT-002 and its credential.
        var request = Guid.NewGuid();
        using (var service = factory.ServiceClient())
        {
            var envelope = new TransportEventEnvelope(Guid.NewGuid(), 1, TransportEventTypes.JobRobotAssignmentChanged, _t0.AddSeconds(-30), "warotrans-core",
                request, "REQ-MEDIA", Guid.NewGuid(), "JOB-MEDIA", null, _robotSourceId, "RBT-002", Guid.NewGuid(), "OPENED",
                JsonSerializer.SerializeToElement(new { startedAt = _t0.AddSeconds(-30), startReason = "START" }, Json));
            (await service.PostAsJsonAsync("/api/evidence/integrations/transport-events", new TransportEventBatch([envelope]), Json)).EnsureSuccessStatusCode();
        }

        using var admin = factory.UserClient("ADMIN");
        var credential = await (await admin.PostAsync("/api/evidence/admin/robots/RBT-002/credentials", null)).Content.ReadFromJsonAsync<RobotCredentialResponse>(Json);
        using var robot = factory.CreateClient();
        robot.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", credential!.AuthorizationHeader);

        var start = await (await robot.PostAsJsonAsync("/api/evidence/edge/recordings", new StartRecordingRequest(
            "rec-media", null, _t0, Guid.NewGuid(), "front", "Camera Module 3 Wide", 120, null, null, 320, 240, 10, "MJPEG", "test"), Json))
            .Content.ReadFromJsonAsync<StartRecordingResponse>(Json);

        // Three real 4 s MJPEG AVI segments, back to back.
        var folder = Directory.CreateTempSubdirectory("evidence-avi").FullName;
        var boot = Guid.NewGuid();
        var files = Enumerable.Range(0, 3).Select(i => MakeMjpegAvi(folder, i, 4, 10)).ToList();
        var intents = files.Select((body, i) => new SegmentIntent(Guid.NewGuid(), i, _t0.AddSeconds(4 * i), _t0.AddSeconds(4 * i + 4),
            i * 4_000_000_000L, i * 4_000_000_000L + 3_900_000_000L, boot, 4000, 40, 0, 0, 20, "AVI", "MJPEG", body.Length,
            Convert.ToHexStringLower(SHA256.HashData(body)))).ToList();
        (await robot.PostAsJsonAsync($"/api/evidence/edge/recordings/{start!.RecordingId}/segments", new RegisterSegmentsRequest(intents), Json)).EnsureSuccessStatusCode();
        for (var i = 0; i < 3; i++)
        {
            var grant = await (await robot.PostAsync($"/api/evidence/edge/segments/{intents[i].SegmentId}/upload-grant", null)).Content.ReadFromJsonAsync<UploadGrantResponse>(Json);
            using var put = new HttpRequestMessage(HttpMethod.Put, new Uri(grant!.Url).PathAndQuery) { Content = new ByteArrayContent(files[i]) };
            put.Headers.TryAddWithoutValidation("x-amz-checksum-sha256", grant.Headers["x-amz-checksum-sha256"]);
            Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(put)).StatusCode);
        }

        // Worker: verify the three uploads.
        foreach (var message in await ReceiveAsync(EvidenceQueues.SegmentIngest, TimeSpan.Zero))
        {
            await using var scope = factory.Services.CreateAsyncScope();
            var ingest = new SegmentIngestionHandler(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>(),
                scope.ServiceProvider.GetRequiredService<IObjectStore>(), TimeProvider.System, NullLogger<SegmentIngestionHandler>.Instance);
            Assert.Equal(MessageOutcome.Done, await ingest.HandleAsync(message, CancellationToken.None));
            await factory.Services.GetRequiredService<IWorkQueue>().DeleteAsync(message, CancellationToken.None);
        }

        (await robot.PostAsJsonAsync($"/api/evidence/edge/recordings/{start.RecordingId}/finalize",
            new FinalizeRecordingRequest(_t0.AddSeconds(12), 3, null, "done"), Json)).EnsureSuccessStatusCode();
        var publisher = new EvidenceOutboxPublisher(factory.Services.GetRequiredService<IServiceScopeFactory>(), factory.Services.GetRequiredService<IWorkQueue>(),
            Microsoft.Extensions.Options.Options.Create(new WorkerOptions()), TimeProvider.System, NullLogger<EvidenceOutboxPublisher>.Instance);
        Assert.Equal(1, await publisher.PublishOnceAsync(CancellationToken.None));

        // Worker: submit to the (local) transcoder; a duplicate message submits nothing more.
        var storage = factory.Services.GetRequiredService<EvidenceStorageOptions>();
        var transcoder = new LocalFfmpegTranscoder(storage, Microsoft.Extensions.Options.Options.Create(new EvidenceMediaOptions { Provider = "Local" }),
            factory.Services.GetRequiredService<IWorkQueue>(), NullLogger<LocalFfmpegTranscoder>.Instance);
        var process = Assert.Single(await ReceiveAsync(EvidenceQueues.MediaProcess, TimeSpan.Zero));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var submit = new MediaSubmissionHandler(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>(), transcoder, storage,
                TimeProvider.System, NullLogger<MediaSubmissionHandler>.Instance);
            Assert.Equal(MessageOutcome.Done, await submit.HandleAsync(process, CancellationToken.None));
            Assert.Equal(MessageOutcome.Done, await submit.HandleAsync(process, CancellationToken.None));
        }

        var job = await DbAsync(db => db.ProcessingJobs.SingleAsync());
        Assert.Equal(MediaProcessingStatus.SUBMITTED, job.Status);
        Assert.Equal(1, job.AttemptCount);

        // The transcoder reports on media-result (EventBridge shape); the Worker checks the output and maps it.
        var result = Assert.Single(await ReceiveAsync(EvidenceQueues.MediaResult, TimeSpan.FromSeconds(90)));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var results = new MediaResultHandler(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>(),
                scope.ServiceProvider.GetRequiredService<IObjectStore>(), TimeProvider.System, NullLogger<MediaResultHandler>.Instance);
            Assert.Equal(MessageOutcome.Done, await results.HandleAsync(result, CancellationToken.None));
            Assert.Equal(MessageOutcome.Done, await results.HandleAsync(result, CancellationToken.None)); // duplicate event: no change
        }

        var asset = await DbAsync(db => db.MediaAssets.SingleAsync());
        Assert.Equal(MediaAssetStatus.READY, asset.Status);
        Assert.Equal(MediaProcessingStatus.COMPLETE, (await DbAsync(db => db.ProcessingJobs.SingleAsync())).Status);
        Assert.Equal(RecordingStatus.READY, (await DbAsync(db => db.Recordings.SingleAsync())).Status);
        Assert.InRange(asset.DurationMs!.Value, 11_500, 12_500);

        var spans = await admin.GetFromJsonAsync<RecordingSpansResponse>($"/api/evidence/recordings/{start.RecordingId}/spans", Json);
        Assert.Equal([0L, 4000L, 8000L], spans!.Spans.Select(s => s.MediaStartMs));
        Assert.All(spans.Spans, s => Assert.Equal(PlaybackSpanBuilder.CfrSlotV1, s.MappingMethod));
        Assert.Empty(spans.Gaps);

        // Playback: a signed grant for this asset's folder only, audited.
        var playback = await (await admin.PostAsync($"/api/evidence/media/{asset.Id}/playback-grant", null)).Content.ReadFromJsonAsync<PlaybackGrant>(Json);
        Assert.Equal("query", playback!.Mode);
        var masterPath = new Uri(playback.MasterUrl).AbsolutePath;
        using var browser = factory.CreateClient();
        var master = await browser.GetAsync($"{masterPath}?{playback.Query}");
        Assert.Equal(HttpStatusCode.OK, master.StatusCode);
        Assert.StartsWith("#EXTM3U", await master.Content.ReadAsStringAsync());
        var variant = HlsPlaylists.ParseMaster(await master.Content.ReadAsStringAsync())[0];
        var variantPath = masterPath[..(masterPath.LastIndexOf('/') + 1)] + variant.Uri;
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync($"{variantPath}?{playback.Query}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.GetAsync($"{masterPath}?{playback.Query.Replace("sig=", "sig=0")}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.GetAsync(masterPath + "?prefix=raw/&exp=9999999999&sig=x")).StatusCode);

        factory.Core.Answer("/api/identity/me/capabilities", new
        {
            accountId = Guid.NewGuid(), role = "TECHNICIAN", permissions = Array.Empty<string>(),
            robotScope = new { allRobots = false, robotIds = new[] { Guid.NewGuid() } }
        });
        using var technician = factory.UserClient("TECHNICIAN");
        Assert.Equal(HttpStatusCode.Forbidden, (await technician.PostAsync($"/api/evidence/media/{asset.Id}/playback-grant", null)).StatusCode);
        using var staff = factory.UserClient("STAFF");
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsync($"/api/evidence/media/{asset.Id}/playback-grant", null)).StatusCode);
        var plays = await DbAsync(db => db.AccessAudits.Where(a => a.Action == AccessAction.PLAY).Select(a => a.Result).ToListAsync());
        Assert.Contains(AccessResult.ALLOWED, plays);
        Assert.Contains(AccessResult.DENIED, plays);
    }

    [Fact]
    public async Task A_result_for_an_unknown_job_is_retried_then_dropped()
    {
        var queue = factory.Services.GetRequiredService<IWorkQueue>();
        await queue.SendAsync(EvidenceQueues.MediaResult, MediaJobEvents.Write(new MediaJobStateChange("job-x", "COMPLETE", Guid.NewGuid(), null, null, 1000)), CancellationToken.None);
        var message = Assert.Single(await ReceiveAsync(EvidenceQueues.MediaResult, TimeSpan.Zero));
        await using var scope = factory.Services.CreateAsyncScope();
        var results = new MediaResultHandler(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>(),
            scope.ServiceProvider.GetRequiredService<IObjectStore>(), TimeProvider.System, NullLogger<MediaResultHandler>.Instance);
        Assert.Equal(MessageOutcome.Retry, await results.HandleAsync(message, CancellationToken.None));
        Assert.Equal(MessageOutcome.Drop, await results.HandleAsync(message with { ReceiveCount = 5 }, CancellationToken.None));
    }
}
