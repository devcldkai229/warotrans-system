using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Processing;
using WaroTrans.Evidence.Recorder.Features.Journals;
using WaroTrans.Evidence.Recorder.Services;
using WaroTrans.Evidence.Status;
using WaroTrans.Evidence.Storage;

namespace WaroTrans.Evidence.Recorder.Features.Edge.Recordings;

/// <summary>
/// The recording lifecycle as the robot drives it (spec §9.3): start a session for its current run, register each
/// closed segment before uploading it, get a short-lived upload grant per segment, finalize with the expected count.
/// Every call can be repeated (the robot retries after a reboot or a network loss) and gives the same result.
/// </summary>
internal static partial class RecordingEndpoints
{
    private static readonly string[] Containers = ["AVI", "MOV"];

    [GeneratedRegex("^[0-9a-f]{64}$")]
    private static partial Regex Sha256Pattern();

    public static void Map(RouteGroupBuilder edge)
    {
        edge.MapPost("/recordings", StartAsync).WithName("EdgeStartRecording");
        edge.MapPost("/recordings/{recordingId:guid}/segments", RegisterAsync).WithName("EdgeRegisterSegments");
        edge.MapPost("/segments/{segmentId:guid}/upload-grant", GrantAsync).WithName("EdgeSegmentUploadGrant");
        edge.MapPost("/recordings/{recordingId:guid}/finalize", FinalizeAsync).WithName("EdgeFinalizeRecording");
        edge.MapPost("/recordings/{recordingId:guid}/heartbeat", HeartbeatAsync).WithName("EdgeRecordingHeartbeat");
    }

    private static async Task<IResult> StartAsync(
        StartRecordingRequest request, ClaimsPrincipal robot, EvidenceDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.EdgeRecordingKey) || request.EdgeRecordingKey.Length > 64)
        {
            return RobotRuns.Invalid("edgeRecordingKey: 1–64 characters.");
        }

        if (!EvidenceKeys.IsValidCameraId(request.CameraId))
        {
            return RobotRuns.Invalid("cameraId: lowercase letters, digits, - and _.");
        }

        if (request.Width <= 0 || request.Height <= 0 || request.TargetFps is <= 0 or > 120)
        {
            return RobotRuns.Invalid("width, height and targetFps must be positive (fps ≤ 120).");
        }

        var existing = await db.Recordings.Include(r => r.Run)
            .FirstOrDefaultAsync(r => r.EdgeRecordingKey == request.EdgeRecordingKey, ct);
        if (existing is not null)
        {
            return existing.Run.RobotId == robot.RobotCode()
                ? Results.Ok(await ResponseAsync(db, existing, ct))
                : RobotRuns.NotFound("recording");
        }

        var run = await RobotRuns.AtAsync(db, robot.RobotCode()!, request.StartedAtUtc, ct);
        if (run is null)
        {
            // Not bound yet: the robot keeps recording locally and asks again (its assignment may not have arrived).
            return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "No run of this robot at that time yet.",
                extensions: new Dictionary<string, object?> { ["code"] = "no_run_yet" });
        }

        var now = clock.GetUtcNow();
        var recording = new CameraRecording
        {
            Id = Guid.NewGuid(),
            RobotRunEvidenceId = run.Id,
            CameraId = request.CameraId,
            CameraModel = Bounded(request.CameraModel, 128),
            NominalFovDegrees = request.NominalFovDegrees,
            CameraCalibrationVersion = request.CameraCalibrationVersion is null ? null : Bounded(request.CameraCalibrationVersion, 64),
            MountPose = request.MountPose is { ValueKind: JsonValueKind.Object } pose ? pose.GetRawText() : null,
            Width = request.Width,
            Height = request.Height,
            TargetFps = request.TargetFps,
            SourceCodec = Bounded(request.SourceCodec, 24),
            CaptureSoftwareVersion = Bounded(request.CaptureSoftwareVersion, 64),
            Status = RecordingStatus.RECORDING,
            EdgeRecordingKey = request.EdgeRecordingKey,
            BootSessionId = request.BootSessionId,
            StartedAtUtc = request.StartedAtUtc,
            LastHeartbeatAtUtc = now,
            CreatedAtUtc = now
        };
        db.Recordings.Add(recording);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            db.ChangeTracker.Clear();
            recording = await db.Recordings.FirstAsync(r => r.EdgeRecordingKey == request.EdgeRecordingKey, ct);
        }

        return Results.Ok(await ResponseAsync(db, recording, ct));
    }

    private static async Task<StartRecordingResponse> ResponseAsync(EvidenceDbContext db, CameraRecording recording, CancellationToken ct)
    {
        var run = await db.Runs.Include(r => r.Journal).FirstAsync(r => r.Id == recording.RobotRunEvidenceId, ct);
        return new StartRecordingResponse(recording.Id, run.Id, run.JournalId, run.Journal.TransportRequestId, recording.Status.ToString());
    }

    private static async Task<IResult> RegisterAsync(
        Guid recordingId, RegisterSegmentsRequest request, ClaimsPrincipal robot, EvidenceDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (request.Segments is not { Count: > 0 and <= 100 })
        {
            return RobotRuns.Invalid("1 to 100 segments per call.");
        }

        if (request.Segments.FirstOrDefault(s => Problem(s) is not null) is { } bad)
        {
            return RobotRuns.Invalid($"segment {bad.SequenceNumber}: {Problem(bad)}");
        }

        var recording = await RobotRuns.OwnRecordingAsync(db, robot, recordingId, ct);
        if (recording is null)
        {
            return RobotRuns.NotFound("recording");
        }

        var now = clock.GetUtcNow();
        var result = new List<RegisteredSegment>();
        var sealedNow = new List<Guid>();
        var groups = await db.ContinuityGroups.Where(g => g.RecordingId == recordingId).OrderBy(g => g.GroupOrdinal).ToListAsync(ct);
        var last = await db.Segments.Where(s => s.RecordingId == recordingId).OrderByDescending(s => s.SequenceNumber).FirstOrDefaultAsync(ct);
        foreach (var intent in request.Segments.OrderBy(s => s.SequenceNumber))
        {
            var known = await db.Segments.FirstOrDefaultAsync(s => s.Id == intent.SegmentId || (s.RecordingId == recordingId && s.SequenceNumber == intent.SequenceNumber), ct);
            if (known is not null)
            {
                if (known.Id != intent.SegmentId || known.Sha256 != intent.Sha256 || known.RecordingId != recordingId)
                {
                    return Results.Problem(statusCode: StatusCodes.Status409Conflict,
                        title: $"Segment {intent.SequenceNumber} is already registered with other content.");
                }

                var g = groups.First(x => x.Id == known.ContinuityGroupId);
                result.Add(new RegisteredSegment(known.Id, known.SequenceNumber, g.Id, g.GroupOrdinal, known.UploadStatus.ToString()));
                continue;
            }

            if (last is not null && intent.SequenceNumber < last.SequenceNumber)
            {
                return Results.Problem(statusCode: StatusCodes.Status409Conflict,
                    title: $"Segment {intent.SequenceNumber} comes after {last.SequenceNumber}: register in order.");
            }

            var segment = new VideoSegment
            {
                Id = intent.SegmentId,
                RecordingId = recordingId,
                SequenceNumber = intent.SequenceNumber,
                CapturedFromUtc = intent.CapturedFromUtc,
                CapturedToUtc = intent.CapturedToUtc,
                StartMonotonicNs = intent.StartMonotonicNs,
                EndMonotonicNs = intent.EndMonotonicNs,
                BootSessionId = intent.BootSessionId,
                DurationMs = intent.DurationMs,
                FrameCount = intent.FrameCount,
                DroppedFrameCount = intent.DroppedFrameCount,
                DuplicatedFrameCount = intent.DuplicatedFrameCount,
                MaxSlotErrorMs = intent.MaxSlotErrorMs,
                ContainerFormat = intent.ContainerFormat.ToUpperInvariant(),
                Codec = intent.Codec.ToUpperInvariant(),
                ByteSize = intent.ByteSize,
                Sha256 = intent.Sha256,
                UploadStatus = SegmentUploadStatus.REGISTERED,
                CreatedAtUtc = now
            };

            var current = groups.LastOrDefault();
            var inCurrent = current is null ? 0 : await db.Segments.CountAsync(s => s.ContinuityGroupId == current.Id, ct)
                                                   + db.Segments.Local.Count(s => s.ContinuityGroupId == current.Id && db.Entry(s).State == EntityState.Added);
            var reason = SegmentGrouping.NewGroupReason(current, last, segment, inCurrent);
            if (current is null || reason is not null)
            {
                if (current is { Status: ContinuityGroupStatus.OPEN })
                {
                    current.Status = ContinuityGroupStatus.SEALED;
                    current.ExpectedSegmentCount = inCurrent;
                    sealedNow.Add(current.Id);
                }

                current = new RecordingContinuityGroup
                {
                    Id = Guid.NewGuid(),
                    RecordingId = recordingId,
                    GroupOrdinal = groups.Count == 0 ? 1 : groups[^1].GroupOrdinal + 1,
                    CapturedFromUtc = segment.CapturedFromUtc,
                    FirstSequenceNumber = segment.SequenceNumber,
                    Status = ContinuityGroupStatus.OPEN,
                    GapReason = reason
                };
                db.ContinuityGroups.Add(current);
                groups.Add(current);
            }

            current.CapturedToUtc = segment.CapturedToUtc;
            current.LastSequenceNumber = segment.SequenceNumber;
            segment.ContinuityGroupId = current.Id;
            db.Segments.Add(segment);
            last = segment;
            result.Add(new RegisteredSegment(segment.Id, segment.SequenceNumber, current.Id, current.GroupOrdinal, segment.UploadStatus.ToString()));
        }

        recording.LastHeartbeatAtUtc = now;
        await db.SaveChangesAsync(ct);
        // A group closed by a gap may already be fully uploaded: it can go to processing now.
        foreach (var groupId in sealedNow)
        {
            await GroupReadiness.EvaluateAsync(db, groupId, now, ct);
        }

        await db.SaveChangesAsync(ct);
        return Results.Ok(new RegisterSegmentsResponse(result));
    }

    private static string? Problem(SegmentIntent s)
    {
        if (s.SegmentId == Guid.Empty || s.SequenceNumber < 0)
        {
            return "segmentId and a sequence number ≥ 0 are required";
        }

        if (s.CapturedToUtc < s.CapturedFromUtc || s.EndMonotonicNs < s.StartMonotonicNs)
        {
            return "times go backwards";
        }

        if (s.FrameCount <= 0 || s.DroppedFrameCount < 0 || s.DuplicatedFrameCount < 0 || s.ByteSize <= 0 || s.DurationMs <= 0)
        {
            return "counts must be positive";
        }

        if (!Sha256Pattern().IsMatch(s.Sha256))
        {
            return "sha256 must be 64 lowercase hex characters";
        }

        if (!Containers.Contains(s.ContainerFormat.ToUpperInvariant()) || !string.Equals(s.Codec, "MJPEG", StringComparison.OrdinalIgnoreCase))
        {
            return "only MJPEG in AVI or MOV";
        }

        return s.ByteSize > 2L * 1024 * 1024 * 1024 ? "larger than 2 GiB" : null;
    }

    private static async Task<IResult> GrantAsync(
        Guid segmentId, ClaimsPrincipal robot, EvidenceDbContext db, IObjectStore store, EvidenceStorageOptions storage,
        TimeProvider clock, CancellationToken ct)
    {
        var code = robot.RobotCode();
        var segment = await db.Segments
            .Include(s => s.Recording).ThenInclude(r => r.Run).ThenInclude(r => r.Journal)
            .Include(s => s.ContinuityGroup)
            .FirstOrDefaultAsync(s => s.Id == segmentId && s.Recording.Run.RobotId == code, ct);
        if (segment is null)
        {
            return RobotRuns.NotFound("segment");
        }

        if (segment.UploadStatus is SegmentUploadStatus.UPLOADED or SegmentUploadStatus.VERIFIED)
        {
            return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Already uploaded.",
                extensions: new Dictionary<string, object?> { ["code"] = "already_uploaded", ["uploadStatus"] = segment.UploadStatus.ToString() });
        }

        if (segment.UploadStatus == SegmentUploadStatus.QUARANTINED)
        {
            return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Quarantined: the stored file did not match.",
                extensions: new Dictionary<string, object?> { ["code"] = "quarantined" });
        }

        var run = segment.Recording.Run;
        var key = segment.S3Key ?? EvidenceKeys.Segment(run.Journal.TransportRequestId, run.JournalId, run.Id, segment.Recording.CameraId,
            segment.RecordingId, segment.ContinuityGroup.GroupOrdinal, segment.Id);
        var grant = await store.PresignPutAsync(key, segment.ByteSize, segment.Sha256, TimeSpan.FromMinutes(Math.Clamp(storage.UploadGrantMinutes, 1, 60)), ct);
        segment.S3Bucket = store.Bucket;
        segment.S3Key = key;
        segment.UploadAttemptCount++;
        if (segment.UploadStatus is SegmentUploadStatus.REGISTERED or SegmentUploadStatus.FAILED)
        {
            segment.UploadStatus = StatusTransitions.Move(segment.UploadStatus, SegmentUploadStatus.UPLOAD_PENDING, StatusTransitions.CanMove);
        }

        await db.SaveChangesAsync(ct);
        _ = clock;
        return Results.Ok(new UploadGrantResponse(segment.Id, key, grant.Url, grant.Method, grant.Headers, grant.ExpiresAtUtc));
    }

    private static async Task<IResult> FinalizeAsync(
        Guid recordingId, FinalizeRecordingRequest request, ClaimsPrincipal robot, EvidenceDbContext db,
        JournalStatusService statuses, TimeProvider clock, CancellationToken ct)
    {
        if (request.ExpectedSegmentCount < 0)
        {
            return RobotRuns.Invalid("expectedSegmentCount must be ≥ 0.");
        }

        var recording = await RobotRuns.OwnRecordingAsync(db, robot, recordingId, ct);
        if (recording is null)
        {
            return RobotRuns.NotFound("recording");
        }

        var now = clock.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var registered = await db.Segments.CountAsync(s => s.RecordingId == recordingId, ct);
        var queued = 0;
        if (recording.FinalizedAtUtc is null)
        {
            recording.EndedAtUtc = request.EndedAtUtc;
            recording.ExpectedSegmentCount = request.ExpectedSegmentCount;
            recording.FinalizedAtUtc = now;
            if (recording.Status == RecordingStatus.RECORDING)
            {
                recording.Status = RecordingStatus.FINALIZING;
            }

            if (registered == 0)
            {
                recording.Status = request.ExpectedSegmentCount == 0 ? RecordingStatus.FAILED : RecordingStatus.FINALIZING;
            }
            else if (recording.Status == RecordingStatus.FINALIZING)
            {
                recording.Status = RecordingStatus.UPLOADING;
            }

            foreach (var group in await db.ContinuityGroups.Where(g => g.RecordingId == recordingId && g.Status == ContinuityGroupStatus.OPEN).ToListAsync(ct))
            {
                group.Status = ContinuityGroupStatus.SEALED;
                group.ExpectedSegmentCount = await db.Segments.CountAsync(s => s.ContinuityGroupId == group.Id, ct);
            }

            foreach (var gap in request.Gaps ?? [])
            {
                db.Events.Add(new EvidenceEvent
                {
                    Id = Guid.NewGuid(),
                    JournalId = recording.Run.JournalId,
                    RobotRunEvidenceId = recording.RobotRunEvidenceId,
                    SourceSystem = $"robot:{recording.Run.RobotId}",
                    SourceEventId = $"gap:{recording.Id:N}:{gap.FromUtc.ToUnixTimeMilliseconds()}",
                    Category = EvidenceEventCategory.RECORDING,
                    EventType = "recording.gap",
                    Severity = EvidenceSeverity.WARNING,
                    OccurredAtUtc = gap.FromUtc,
                    ReceivedAtUtc = now,
                    Message = $"No video {gap.FromUtc:HH:mm:ss}–{gap.ToUtc:HH:mm:ss} ({Bounded(gap.Reason, 64)})",
                    Payload = JsonSerializer.Serialize(gap, GroupReadiness.Json),
                    CorrelationId = recording.Run.SourceJobNo,
                    PayloadSchemaVersion = 1
                });
            }

            await db.SaveChangesAsync(ct);
            foreach (var groupId in await db.ContinuityGroups.Where(g => g.RecordingId == recordingId).Select(g => g.Id).ToListAsync(ct))
            {
                queued += (await GroupReadiness.EvaluateAsync(db, groupId, now, ct)).Count;
            }

            await statuses.RecomputeAsync(recording.Run.Journal, ct);
            await db.SaveChangesAsync(ct);
        }

        await transaction.CommitAsync(ct);
        var verified = await db.Segments.CountAsync(s => s.RecordingId == recordingId && s.UploadStatus == SegmentUploadStatus.VERIFIED, ct);
        return Results.Ok(new FinalizeRecordingResponse(recording.Id, recording.Status.ToString(), registered, verified, queued));
    }

    private static async Task<IResult> HeartbeatAsync(
        Guid recordingId, RecordingHeartbeatRequest request, ClaimsPrincipal robot, EvidenceDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var recording = await RobotRuns.OwnRecordingAsync(db, robot, recordingId, ct);
        if (recording is null)
        {
            return RobotRuns.NotFound("recording");
        }

        recording.LastHeartbeatAtUtc = clock.GetUtcNow();
        if (request.ClockErrorBoundMs is { } bound && double.IsFinite(bound))
        {
            recording.Run.TimeSyncErrorBoundMs = Math.Max(recording.Run.TimeSyncErrorBoundMs ?? 0, bound);
        }

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static string Bounded(string? text, int max) =>
        string.IsNullOrEmpty(text) ? string.Empty : text.Length <= max ? text : text[..max];
}
