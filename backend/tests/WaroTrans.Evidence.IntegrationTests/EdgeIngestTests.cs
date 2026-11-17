extern alias worker;

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
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Recorder.Features.Admin.IssueRobotCredential;
using WaroTrans.Evidence.Recorder.Features.Edge;
using WaroTrans.Evidence.Storage;
using SegmentIngestionHandler = worker::WaroTrans.Evidence.Worker.Features.SegmentIngestion.SegmentIngestionHandler;
using MessageOutcome = worker::WaroTrans.Evidence.Worker.Services.MessageOutcome;
using EvidenceOutboxPublisher = worker::WaroTrans.Evidence.Worker.Features.OutboxPublisher.EvidenceOutboxPublisher;
using WorkerOptions = worker::WaroTrans.Evidence.Worker.Services.WorkerOptions;

namespace WaroTrans.Evidence.IntegrationTests;

/// <summary>
/// Phase 2 end to end on the Local providers (folder store + queue table), with the real Recorder and the Worker's
/// handlers: a robot records, registers, uploads through its grants, S3-style notifications are verified, the sealed
/// group gets exactly one media job, and every unhappy case of spec §13 for ingestion behaves.
/// </summary>
[Collection(RecorderCollection.Name)]
public sealed class EdgeIngestTests(RecorderFactory factory) : IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly Guid _request = Guid.NewGuid();
    private readonly Guid _boot = Guid.NewGuid();
    private readonly DateTimeOffset _t0 = DateTimeOffset.UtcNow.AddMinutes(-10);
    private HttpClient _robot = null!;

    public async Task InitializeAsync()
    {
        await factory.ResetAsync();
        await OpenRunAsync("RBT-002", _t0.AddSeconds(-30));
        _robot = await RobotClientAsync("RBT-002");
    }

    public Task DisposeAsync()
    {
        _robot.Dispose();
        return Task.CompletedTask;
    }

    // ------------------------------------------------------------------ helpers

    private async Task OpenRunAsync(string robot, DateTimeOffset at, Guid? request = null)
    {
        var assignment = Guid.NewGuid();
        var envelope = new TransportEventEnvelope(Guid.NewGuid(), 1, TransportEventTypes.JobRobotAssignmentChanged, at, "warotrans-core",
            request ?? _request, "REQ-20261117-000099", Guid.NewGuid(), "JOB-9", null, Guid.NewGuid(), robot, assignment, "OPENED",
            JsonSerializer.SerializeToElement(new { startedAt = at, startReason = "START", containerIds = new[] { Guid.NewGuid() }, mapVersionCode = "MAP-ONE-V014" }, Json));
        using var service = factory.ServiceClient();
        (await service.PostAsJsonAsync("/api/evidence/integrations/transport-events", new TransportEventBatch([envelope]), Json)).EnsureSuccessStatusCode();
    }

    private async Task<HttpClient> RobotClientAsync(string robot)
    {
        using var admin = factory.UserClient("ADMIN");
        var credential = await (await admin.PostAsync($"/api/evidence/admin/robots/{robot}/credentials", null))
            .Content.ReadFromJsonAsync<RobotCredentialResponse>(Json);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", credential!.AuthorizationHeader);
        return client;
    }

    private async Task<StartRecordingResponse> StartAsync(HttpClient robot, string key, DateTimeOffset at)
    {
        var response = await robot.PostAsJsonAsync("/api/evidence/edge/recordings", new StartRecordingRequest(
            key, null, at, _boot, "front", "Raspberry Pi Camera Module 3 Wide", 120, null, null, 1280, 720, 15, "MJPEG", "warotrans_camera 0.2.0"), Json);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<StartRecordingResponse>(Json))!;
    }

    private sealed record LocalSegment(SegmentIntent Intent, byte[] Body);

    private LocalSegment Segment(int sequence, DateTimeOffset from, Guid? boot = null)
    {
        var body = RandomNumberGenerator.GetBytes(2048 + sequence);
        var sha = Convert.ToHexStringLower(SHA256.HashData(body));
        return new LocalSegment(new SegmentIntent(Guid.NewGuid(), sequence, from, from.AddSeconds(30), sequence * 30_000_000_000L,
            sequence * 30_000_000_000L + 29_933_000_000L, boot ?? _boot, 30_000, 450, 0, 1, 12.5, "AVI", "MJPEG", body.Length, sha), body);
    }

    private async Task<RegisterSegmentsResponse> RegisterAsync(Guid recording, params LocalSegment[] segments)
    {
        var response = await _robot.PostAsJsonAsync($"/api/evidence/edge/recordings/{recording}/segments",
            new RegisterSegmentsRequest(segments.Select(s => s.Intent).ToList()), Json);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RegisterSegmentsResponse>(Json))!;
    }

    /// <summary>Gets a grant and PUTs the body the way the robot does (through the test server).</summary>
    private async Task<HttpStatusCode> UploadAsync(LocalSegment segment, byte[]? body = null)
    {
        var grant = await (await _robot.PostAsync($"/api/evidence/edge/segments/{segment.Intent.SegmentId}/upload-grant", null))
            .Content.ReadFromJsonAsync<UploadGrantResponse>(Json);
        var url = new Uri(grant!.Url);
        using var put = new HttpRequestMessage(HttpMethod.Put, url.PathAndQuery) { Content = new ByteArrayContent(body ?? segment.Body) };
        foreach (var (name, value) in grant.Headers)
        {
            if (!put.Headers.TryAddWithoutValidation(name, value))
            {
                put.Content.Headers.TryAddWithoutValidation(name, value);
            }
        }

        using var anonymous = factory.CreateClient();
        return (await anonymous.SendAsync(put)).StatusCode;
    }

    /// <summary>Runs the Worker's ingestion over everything on the segment-ingest queue.</summary>
    private async Task<int> IngestAllAsync()
    {
        var queue = factory.Services.GetRequiredService<IWorkQueue>();
        var handled = 0;
        while (true)
        {
            var messages = await queue.ReceiveAsync(EvidenceQueues.SegmentIngest, 10, TimeSpan.Zero, TimeSpan.FromSeconds(30), CancellationToken.None);
            if (messages.Count == 0)
            {
                return handled;
            }

            foreach (var message in messages)
            {
                await using var scope = factory.Services.CreateAsyncScope();
                var handler = new SegmentIngestionHandler(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>(),
                    scope.ServiceProvider.GetRequiredService<IObjectStore>(), TimeProvider.System, NullLogger<SegmentIngestionHandler>.Instance);
                var outcome = await handler.HandleAsync(message, CancellationToken.None);
                if (outcome == MessageOutcome.Retry)
                {
                    await queue.ReleaseAsync(message, TimeSpan.FromHours(1), CancellationToken.None);
                }
                else
                {
                    await queue.DeleteAsync(message, CancellationToken.None);
                }

                handled++;
            }
        }
    }

    private async Task<T> DbAsync<T>(Func<EvidenceDbContext, Task<T>> read)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await read(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>());
    }

    private async Task<FinalizeRecordingResponse> FinalizeAsync(Guid recording, int expected)
    {
        var response = await _robot.PostAsJsonAsync($"/api/evidence/edge/recordings/{recording}/finalize",
            new FinalizeRecordingRequest(_t0.AddMinutes(5), expected, null, "run ended"), Json);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<FinalizeRecordingResponse>(Json))!;
    }

    // ------------------------------------------------------------------ tests

    [Fact]
    public async Task Recorded_segments_are_uploaded_verified_and_their_group_gets_one_media_job()
    {
        var recording = await StartAsync(_robot, "rec-1", _t0);
        var segments = Enumerable.Range(0, 3).Select(i => Segment(i, _t0.AddSeconds(30 * i))).ToArray();
        var registered = await RegisterAsync(recording.RecordingId, segments);
        Assert.Single(registered.Segments.Select(s => s.ContinuityGroupId).Distinct());

        foreach (var segment in segments)
        {
            Assert.Equal(HttpStatusCode.OK, await UploadAsync(segment));
        }

        Assert.Equal(3, await IngestAllAsync());
        Assert.Equal(3, await DbAsync(db => db.Segments.CountAsync(s => s.UploadStatus == SegmentUploadStatus.VERIFIED)));

        var finalized = await FinalizeAsync(recording.RecordingId, 3);
        Assert.Equal(1, finalized.QueuedJobs);
        Assert.Equal(nameof(RecordingStatus.UPLOADING), finalized.Status);

        // The same notifications again, and a second finalize: still one asset, one job, one outbox message.
        foreach (var segment in segments)
        {
            var stored = (await factory.Services.GetRequiredService<IObjectStore>().HeadAsync(
                (await DbAsync(db => db.Segments.SingleAsync(s => s.Id == segment.Intent.SegmentId))).S3Key!, CancellationToken.None))!;
            await factory.Services.GetRequiredService<IWorkQueue>().SendAsync(EvidenceQueues.SegmentIngest, S3Events.ObjectCreated(stored, DateTimeOffset.UtcNow), CancellationToken.None);
        }

        await IngestAllAsync();
        await FinalizeAsync(recording.RecordingId, 3);
        Assert.Equal(1, await DbAsync(db => db.MediaAssets.CountAsync()));
        Assert.Equal(1, await DbAsync(db => db.ProcessingJobs.CountAsync()));
        var outbox = await DbAsync(db => db.Outbox.SingleAsync());
        var message = JsonSerializer.Deserialize<MediaProcessRequested>(outbox.Payload, Json)!;
        Assert.Equal(recording.RunId, message.EvidenceRunId);
        Assert.Equal(MediaProfiles.HlsV1, message.ProfileVersion);

        // The Worker's outbox publisher puts it on the media-process queue once.
        var publisher = new EvidenceOutboxPublisher(factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.Services.GetRequiredService<IWorkQueue>(), Microsoft.Extensions.Options.Options.Create(new WorkerOptions()),
            TimeProvider.System, NullLogger<EvidenceOutboxPublisher>.Instance);
        Assert.Equal(1, await publisher.PublishOnceAsync(CancellationToken.None));
        Assert.Equal(0, await publisher.PublishOnceAsync(CancellationToken.None));
        var queued = await factory.Services.GetRequiredService<IWorkQueue>().ReceiveAsync(EvidenceQueues.MediaProcess, 10, TimeSpan.Zero, TimeSpan.FromSeconds(30), CancellationToken.None);
        Assert.Single(queued);
    }

    [Fact]
    public async Task Forty_segments_whose_notifications_arrive_out_of_order_make_one_job_not_forty()
    {
        var recording = await StartAsync(_robot, "rec-40", _t0);
        var segments = Enumerable.Range(0, 40).Select(i => Segment(i, _t0.AddSeconds(30 * i))).ToArray();
        await RegisterAsync(recording.RecordingId, segments);
        foreach (var segment in segments.Reverse())
        {
            Assert.Equal(HttpStatusCode.OK, await UploadAsync(segment));
        }

        // Finalized before the notifications are processed: nothing is transcoded until every segment is verified.
        Assert.Equal(0, (await FinalizeAsync(recording.RecordingId, 40)).QueuedJobs);
        Assert.Equal(0, await DbAsync(db => db.ProcessingJobs.CountAsync()));

        Assert.Equal(40, await IngestAllAsync());
        Assert.Equal(1, await DbAsync(db => db.ProcessingJobs.CountAsync()));
        Assert.Equal(40, await DbAsync(db => db.Segments.CountAsync(s => s.UploadStatus == SegmentUploadStatus.VERIFIED)));
    }

    [Fact]
    public async Task A_reboot_or_a_time_hole_starts_a_new_continuity_group()
    {
        var recording = await StartAsync(_robot, "rec-gap", _t0);
        var afterReboot = Guid.NewGuid();
        var result = await RegisterAsync(recording.RecordingId,
            Segment(0, _t0),
            Segment(1, _t0.AddSeconds(30)),
            Segment(2, _t0.AddSeconds(90)), // 30 s with no video
            Segment(3, _t0.AddSeconds(120), afterReboot));

        Assert.Equal([1, 1, 2, 3], result.Segments.Select(s => s.GroupOrdinal));
        var groups = await DbAsync(db => db.ContinuityGroups.OrderBy(g => g.GroupOrdinal).ToListAsync());
        Assert.Equal([null, ContinuityGapReason.FRAME_GAP, ContinuityGapReason.REBOOT], groups.Select(g => g.GapReason));
        // Closed by the hole and waiting for its uploads to be verified.
        Assert.Equal(ContinuityGroupStatus.VERIFYING, groups[0].Status);
        Assert.Equal(2, groups[0].ExpectedSegmentCount);
        Assert.Equal(ContinuityGroupStatus.OPEN, groups[2].Status);
    }

    [Fact]
    public async Task A_body_that_is_not_the_registered_file_is_refused_and_a_stored_mismatch_is_quarantined()
    {
        var recording = await StartAsync(_robot, "rec-bad", _t0);
        var good = Segment(0, _t0);
        var bad = Segment(1, _t0.AddSeconds(30));
        await RegisterAsync(recording.RecordingId, good, bad);

        // The store refuses a body whose checksum is not the granted one (S3: BadDigest).
        Assert.Equal(HttpStatusCode.BadRequest, await UploadAsync(bad, RandomNumberGenerator.GetBytes(bad.Body.Length)));
        Assert.Equal(HttpStatusCode.OK, await UploadAsync(good));

        // An object that got there anyway with other content (written behind the grant's back) is quarantined.
        var key = (await DbAsync(db => db.Segments.SingleAsync(s => s.Id == bad.Intent.SegmentId))).S3Key!;
        var store = factory.Services.GetRequiredService<LocalObjectStore>();
        var stored = await store.WriteAsync(key, new MemoryStream(RandomNumberGenerator.GetBytes(bad.Body.Length)), CancellationToken.None);
        await factory.Services.GetRequiredService<IWorkQueue>().SendAsync(EvidenceQueues.SegmentIngest, S3Events.ObjectCreated(stored, DateTimeOffset.UtcNow), CancellationToken.None);
        await IngestAllAsync();

        Assert.Equal(SegmentUploadStatus.QUARANTINED, (await DbAsync(db => db.Segments.SingleAsync(s => s.Id == bad.Intent.SegmentId))).UploadStatus);
        Assert.Contains(await DbAsync(db => db.Events.Select(e => e.EventType).ToListAsync()), t => t == "segment.quarantined");

        // The good part is still processed alone; the hole stays a hole.
        await FinalizeAsync(recording.RecordingId, 2);
        var groups = await DbAsync(db => db.ContinuityGroups.OrderBy(g => g.GroupOrdinal).ToListAsync());
        Assert.Equal(ContinuityGroupStatus.PARTIAL, groups[0].Status);
        var part = Assert.Single(groups, g => g.Status == ContinuityGroupStatus.READY_FOR_PROCESSING);
        Assert.Equal(0, part.FirstSequenceNumber);
        Assert.Equal(0, part.LastSequenceNumber);
        Assert.Equal(1, await DbAsync(db => db.ProcessingJobs.CountAsync()));
    }

    [Fact]
    public async Task A_notification_for_a_file_nobody_registered_is_retried_then_dropped()
    {
        var queue = factory.Services.GetRequiredService<IWorkQueue>();
        var stranger = new StoredObject("warotrans-evidence-local", $"raw/transport-requests/{Guid.NewGuid()}/x/segments/{Guid.NewGuid()}.avi", 10, null, null, null, DateTimeOffset.UtcNow);
        await queue.SendAsync(EvidenceQueues.SegmentIngest, S3Events.ObjectCreated(stranger, DateTimeOffset.UtcNow), CancellationToken.None);

        var message = Assert.Single(await queue.ReceiveAsync(EvidenceQueues.SegmentIngest, 10, TimeSpan.Zero, TimeSpan.FromSeconds(30), CancellationToken.None));
        await using var scope = factory.Services.CreateAsyncScope();
        var handler = new SegmentIngestionHandler(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>(),
            scope.ServiceProvider.GetRequiredService<IObjectStore>(), TimeProvider.System, NullLogger<SegmentIngestionHandler>.Instance);
        Assert.Equal(MessageOutcome.Retry, await handler.HandleAsync(message, CancellationToken.None));
        Assert.Equal(MessageOutcome.Drop, await handler.HandleAsync(message with { ReceiveCount = SegmentIngestionHandler.MaxReceivesWithoutIntent }, CancellationToken.None));
    }

    [Fact]
    public async Task A_robot_works_only_on_its_own_runs_and_recordings()
    {
        var recording = await StartAsync(_robot, "rec-own", _t0);
        var segment = Segment(0, _t0);
        await RegisterAsync(recording.RecordingId, segment);

        await OpenRunAsync("RBT-001", _t0, Guid.NewGuid());
        using var other = await RobotClientAsync("RBT-001");
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/api/evidence/edge/segments/{segment.Intent.SegmentId}/upload-grant", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync($"/api/evidence/edge/runs/{recording.RunId}/trajectory",
            new TrajectoryBatchRequest([new TrajectorySample(0, _t0, 1, 2, 0, null, null, "amcl", "map", null, true, null)]), Json)).StatusCode);

        // Same key again from its owner: the same recording, not a second one.
        Assert.Equal(recording.RecordingId, (await StartAsync(_robot, "rec-own", _t0)).RecordingId);

        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/evidence/edge/active-run")).StatusCode);
    }

    [Fact]
    public async Task A_recording_before_its_run_is_known_is_told_to_ask_again()
    {
        using var lonely = await RobotClientAsync("RBT-009");
        var response = await lonely.PostAsJsonAsync("/api/evidence/edge/recordings", new StartRecordingRequest(
            "rec-early", null, _t0, _boot, "front", "cam", 75, null, null, 640, 480, 10, "MJPEG", "x"), Json);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("no_run_yet", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Trajectory_batches_are_idempotent_and_keep_invalid_samples_as_gaps()
    {
        var run = (await _robot.GetFromJsonAsync<ActiveRunResponse>("/api/evidence/edge/active-run", Json))!;
        var points = Enumerable.Range(0, 10)
            .Select(i => new TrajectorySample(i, _t0.AddMilliseconds(200 * i), i * 0.05, 1.0, 0.1, 0.25, 0, "tf:map->base_link", "map", null, i != 5, "MAP-ONE-V014"))
            .ToList();

        var first = await (await _robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/trajectory", new TrajectoryBatchRequest(points), Json))
            .Content.ReadFromJsonAsync<BatchAccepted>(Json);
        var again = await (await _robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/trajectory", new TrajectoryBatchRequest(points), Json))
            .Content.ReadFromJsonAsync<BatchAccepted>(Json);
        Assert.Equal(10, first!.Accepted);
        Assert.Equal(0, again!.Accepted);
        Assert.Equal(1, await DbAsync(db => db.TrajectoryPoints.CountAsync(p => !p.IsValid)));

        var nan = await _robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/trajectory",
            new TrajectoryBatchRequest([points[0] with { SequenceNumber = 99, FrameId = "odom" }]), Json);
        Assert.Equal(HttpStatusCode.BadRequest, nan.StatusCode);
    }

    [Fact]
    public async Task A_replan_closes_the_previous_plan_at_the_time_of_the_new_one()
    {
        var run = (await _robot.GetFromJsonAsync<ActiveRunResponse>("/api/evidence/edge/active-run", Json))!;
        double[][] path = [[0, 0], [1, 0], [1, 1]];
        await _robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/plans", new PlanSnapshotsRequest(
            [new PlanSnapshot(1, "nav2", _t0, "map", "MAP-ONE-V014", path, "h1", "initial")]), Json);
        await _robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/plans", new PlanSnapshotsRequest(
            [new PlanSnapshot(2, "nav2", _t0.AddSeconds(12), "map", "MAP-ONE-V014", path, "h2", "replan")]), Json);

        var plans = await DbAsync(db => db.RoutePlans.OrderBy(p => p.PlanVersion).ToListAsync());
        // Postgres keeps microseconds.
        Assert.Equal(_t0.AddSeconds(12).ToUnixTimeMilliseconds(), plans[0].ValidUntilUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Null(plans[1].ValidUntilUtc);
    }

    [Fact]
    public async Task Robot_events_and_clock_anchors_are_taken_once_and_an_unsynced_clock_marks_the_run()
    {
        var run = (await _robot.GetFromJsonAsync<ActiveRunResponse>("/api/evidence/edge/active-run", Json))!;
        var e = new RobotEvent("loc-1", "localization.jump", "NAVIGATION", "WARNING", _t0.AddSeconds(5), 1.2, 0.4, "Pose jumped 0.8 m", null);
        await _robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/events", new RobotEventsRequest([e, e]), Json);
        await _robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/events", new RobotEventsRequest([e]), Json);
        Assert.Equal(1, await DbAsync(db => db.Events.CountAsync(x => x.SourceSystem == "robot:RBT-002")));

        await _robot.PostAsJsonAsync("/api/evidence/edge/clock-anchors", new ClockAnchorsRequest(
            [new ClockAnchorSample(_boot, 1_000, _t0.AddSeconds(1), "chrony", 0.4, 2.5, true)]), Json);
        Assert.Equal(2.5, (await DbAsync(db => db.Runs.SingleAsync(r => r.Id == run.RunId))).TimeSyncErrorBoundMs);
        await _robot.PostAsJsonAsync("/api/evidence/edge/clock-anchors", new ClockAnchorsRequest(
            [new ClockAnchorSample(_boot, 2_000, _t0.AddSeconds(2), "none", null, null, false)]), Json);
        Assert.True((await DbAsync(db => db.Runs.SingleAsync(r => r.Id == run.RunId))).TimeSyncErrorBoundMs > 1e6);
    }
}
