using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Processing;
using WaroTrans.Evidence.Recorder.Services;

namespace WaroTrans.Evidence.Recorder.Features.Edge.Telemetry;

/// <summary>
/// What the robot observed during its run, in batches (never one request per pose): the path in the map frame, its own
/// events, the planner's paths, and clock anchors. Every batch can be sent again: what is already stored is skipped.
/// </summary>
internal static class TelemetryEndpoints
{
    public const int MaxPoints = 2000;
    public const int MaxEvents = 500;
    public const int MaxPlans = 50;

    /// <summary>Samples this long before the run started or after it ended still belong to it (clock slack).</summary>
    private static readonly TimeSpan Slack = TimeSpan.FromSeconds(60);

    public static void Map(RouteGroupBuilder edge)
    {
        edge.MapGet("/active-run", ActiveRunAsync).WithName("EdgeActiveRun");
        edge.MapPost("/runs/{runId:guid}/trajectory", TrajectoryAsync).WithName("EdgeTrajectoryBatch");
        edge.MapPost("/runs/{runId:guid}/events", EventsAsync).WithName("EdgeRunEvents");
        edge.MapPost("/runs/{runId:guid}/plans", PlansAsync).WithName("EdgePlanSnapshots");
        edge.MapPost("/clock-anchors", AnchorsAsync).WithName("EdgeClockAnchors");
    }

    private static async Task<IResult> ActiveRunAsync(ClaimsPrincipal robot, EvidenceDbContext db, CancellationToken ct)
    {
        var code = robot.RobotCode();
        var run = await db.Runs.Include(r => r.Journal)
            .Where(r => r.RobotId == code && r.EndedAtUtc == null)
            .OrderByDescending(r => r.StartedAtUtc)
            .FirstOrDefaultAsync(ct);
        return run is null
            ? Results.NoContent()
            : Results.Ok(new ActiveRunResponse(run.Id, run.JournalId, run.Journal.TransportRequestId, run.Journal.RequestCode,
                run.SourceJobId, run.SourceJobNo, run.StartedAtUtc));
    }

    private static async Task<IResult> TrajectoryAsync(
        Guid runId, TrajectoryBatchRequest request, ClaimsPrincipal robot, EvidenceDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (request.Points is not { Count: > 0 and <= MaxPoints })
        {
            return RobotRuns.Invalid($"1 to {MaxPoints} points per batch.");
        }

        if (request.Points.FirstOrDefault(p => !double.IsFinite(p.X) || !double.IsFinite(p.Y) || !double.IsFinite(p.YawRad)
                                               || p.SequenceNumber < 0 || p.FrameId != "map"
                                               || (p.LinearVelocityMps is { } v && !double.IsFinite(v))
                                               || (p.AngularVelocityRadps is { } w && !double.IsFinite(w))) is { } bad)
        {
            return RobotRuns.Invalid($"point {bad.SequenceNumber}: finite numbers in the map frame only.");
        }

        var run = await RobotRuns.OwnAsync(db, robot, runId, ct);
        if (run is null)
        {
            return RobotRuns.NotFound("run");
        }

        var now = clock.GetUtcNow();
        var from = (run.StartedAtUtc ?? now) - Slack;
        var to = (run.EndedAtUtc ?? now.Add(Slack)) + Slack;
        var points = request.Points.Where(p => p.CapturedAtUtc >= from && p.CapturedAtUtc <= to).ToList();
        if (points.Count == 0)
        {
            return Results.Ok(new BatchAccepted(0, request.Points.Count));
        }

        var inserted = await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO evidence.trajectory_points
                (robot_run_evidence_id, sequence_number, captured_at_utc, x, y, yaw_rad, linear_velocity_mps,
                 angular_velocity_radps, pose_source, frame_id, localization_quality, is_valid, map_version, received_at_utc)
            SELECT @run, t.seq, t.at, t.x, t.y, t.yaw, t.v, t.w, t.src, t.frame, t.q, t.valid, t.map, @now
            FROM unnest(@seq, @at, @x, @y, @yaw, @v, @w, @src, @frame, @q, @valid, @map)
                 AS t(seq, at, x, y, yaw, v, w, src, frame, q, valid, map)
            ON CONFLICT (robot_run_evidence_id, sequence_number) DO NOTHING
            """,
            [
                new NpgsqlParameter("run", runId),
                new NpgsqlParameter("now", now),
                Array("seq", NpgsqlDbType.Bigint, points.Select(p => p.SequenceNumber).ToArray()),
                Array("at", NpgsqlDbType.TimestampTz, points.Select(p => p.CapturedAtUtc.ToUniversalTime()).ToArray()),
                Array("x", NpgsqlDbType.Double, points.Select(p => p.X).ToArray()),
                Array("y", NpgsqlDbType.Double, points.Select(p => p.Y).ToArray()),
                Array("yaw", NpgsqlDbType.Double, points.Select(p => p.YawRad).ToArray()),
                Array("v", NpgsqlDbType.Double, points.Select(p => p.LinearVelocityMps).ToArray()),
                Array("w", NpgsqlDbType.Double, points.Select(p => p.AngularVelocityRadps).ToArray()),
                Array("src", NpgsqlDbType.Varchar, points.Select(p => Bounded(p.PoseSource, 48)).ToArray()),
                Array("frame", NpgsqlDbType.Varchar, points.Select(p => p.FrameId).ToArray()),
                Array("q", NpgsqlDbType.Real, points.Select(p => p.LocalizationQuality).ToArray()),
                Array("valid", NpgsqlDbType.Boolean, points.Select(p => p.IsValid).ToArray()),
                Array("map", NpgsqlDbType.Varchar, points.Select(p => p.MapVersion is null ? null : Bounded(p.MapVersion, 64)).ToArray())
            ], ct);
        return Results.Ok(new BatchAccepted(inserted, request.Points.Count - inserted));
    }

    private static NpgsqlParameter Array<T>(string name, NpgsqlDbType type, T[] values) =>
        new(name, NpgsqlDbType.Array | type) { Value = values };

    private static async Task<IResult> EventsAsync(
        Guid runId, RobotEventsRequest request, ClaimsPrincipal robot, EvidenceDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (request.Events is not { Count: > 0 and <= MaxEvents })
        {
            return RobotRuns.Invalid($"1 to {MaxEvents} events per batch.");
        }

        var run = await RobotRuns.OwnAsync(db, robot, runId, ct);
        if (run is null)
        {
            return RobotRuns.NotFound("run");
        }

        var source = $"robot:{run.RobotId}";
        var ids = request.Events.Select(e => Bounded(e.SourceEventId, 160)).ToList();
        var known = (await db.Events.Where(e => e.SourceSystem == source && ids.Contains(e.SourceEventId)).Select(e => e.SourceEventId).ToListAsync(ct)).ToHashSet();
        var now = clock.GetUtcNow();
        var accepted = 0;
        foreach (var e in request.Events)
        {
            var id = Bounded(e.SourceEventId, 160);
            if (string.IsNullOrWhiteSpace(id) || !known.Add(id))
            {
                continue;
            }

            if (!Enum.TryParse<EvidenceEventCategory>(e.Category, out var category) || !Enum.TryParse<EvidenceSeverity>(e.Severity, out var severity))
            {
                return RobotRuns.Invalid($"event {id}: unknown category or severity.");
            }

            var payload = e.Payload is { } p ? p.GetRawText() : "{}";
            db.Events.Add(new EvidenceEvent
            {
                Id = Guid.NewGuid(),
                JournalId = run.JournalId,
                RobotRunEvidenceId = run.Id,
                SourceSystem = source,
                SourceEventId = id,
                Category = category,
                EventType = Bounded(e.EventType, 96),
                Severity = severity,
                OccurredAtUtc = e.OccurredAtUtc,
                ReceivedAtUtc = now,
                X = e.X is { } x && double.IsFinite(x) ? x : null,
                Y = e.Y is { } y && double.IsFinite(y) ? y : null,
                FrameId = e.X is null ? null : "map",
                Message = e.Message is null ? null : Bounded(e.Message, 500),
                Payload = payload.Length <= EvidenceEvent.MaxPayloadChars ? payload : "{\"truncated\":true}",
                CorrelationId = run.SourceJobNo,
                PayloadSchemaVersion = 1
            });
            accepted++;
        }

        await db.SaveChangesAsync(ct);
        return Results.Ok(new BatchAccepted(accepted, request.Events.Count - accepted));
    }

    private static async Task<IResult> PlansAsync(
        Guid runId, PlanSnapshotsRequest request, ClaimsPrincipal robot, EvidenceDbContext db, CancellationToken ct)
    {
        if (request.Plans is not { Count: > 0 and <= MaxPlans })
        {
            return RobotRuns.Invalid($"1 to {MaxPlans} plans per batch.");
        }

        if (request.Plans.FirstOrDefault(p => p.PathPoints is null || p.PathPoints.Count > RoutePlanSnapshot.MaxPoints
                                              || p.PathPoints.Any(pt => pt.Length != 2 || !double.IsFinite(pt[0]) || !double.IsFinite(pt[1]))
                                              || p.FrameId != "map") is { } bad)
        {
            return RobotRuns.Invalid($"plan {bad.PlanVersion}: at most {RoutePlanSnapshot.MaxPoints} finite [x,y] points in the map frame.");
        }

        var run = await RobotRuns.OwnAsync(db, robot, runId, ct);
        if (run is null)
        {
            return RobotRuns.NotFound("run");
        }

        var versions = request.Plans.Select(p => p.PlanVersion).ToList();
        var known = (await db.RoutePlans.Where(p => p.RobotRunEvidenceId == runId && versions.Contains(p.PlanVersion)).Select(p => p.PlanVersion).ToListAsync(ct)).ToHashSet();
        var accepted = 0;
        foreach (var plan in request.Plans.OrderBy(p => p.PlanVersion))
        {
            if (!known.Add(plan.PlanVersion))
            {
                continue;
            }

            // The plan it replaces stops being valid when this one was made.
            var previous = await db.RoutePlans
                .Where(p => p.RobotRunEvidenceId == runId && p.PlanVersion < plan.PlanVersion && p.ValidUntilUtc == null)
                .OrderByDescending(p => p.PlanVersion)
                .FirstOrDefaultAsync(ct);
            if (previous is not null)
            {
                previous.ValidUntilUtc = plan.GeneratedAtUtc;
            }

            db.RoutePlans.Add(new RoutePlanSnapshot
            {
                Id = Guid.NewGuid(),
                RobotRunEvidenceId = runId,
                PlanVersion = plan.PlanVersion,
                PlannerName = plan.PlannerName is null ? null : Bounded(plan.PlannerName, 80),
                GeneratedAtUtc = plan.GeneratedAtUtc,
                FrameId = plan.FrameId,
                MapVersion = plan.MapVersion is null ? null : Bounded(plan.MapVersion, 64),
                PathPoints = JsonSerializer.Serialize(plan.PathPoints, GroupReadiness.Json),
                PathHash = plan.PathHash is null ? null : Bounded(plan.PathHash, 64),
                Reason = plan.Reason is null ? null : Bounded(plan.Reason, 48)
            });
            accepted++;
            await db.SaveChangesAsync(ct);
        }

        return Results.Ok(new BatchAccepted(accepted, request.Plans.Count - accepted));
    }

    private static async Task<IResult> AnchorsAsync(
        ClockAnchorsRequest request, ClaimsPrincipal robot, EvidenceDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (request.Anchors is not { Count: > 0 and <= 100 })
        {
            return RobotRuns.Invalid("1 to 100 anchors per batch.");
        }

        var code = robot.RobotCode()!;
        var now = clock.GetUtcNow();
        var accepted = 0;
        foreach (var a in request.Anchors)
        {
            if (await db.ClockAnchors.AnyAsync(x => x.RobotId == code && x.BootSessionId == a.BootSessionId && x.MonotonicNs == a.MonotonicNs, ct))
            {
                continue;
            }

            db.ClockAnchors.Add(new ClockAnchor
            {
                RobotId = code,
                BootSessionId = a.BootSessionId,
                MonotonicNs = a.MonotonicNs,
                UtcEstimate = a.UtcEstimate,
                SyncSource = Bounded(a.SyncSource, 32),
                OffsetMs = a.OffsetMs is { } o && double.IsFinite(o) ? o : null,
                ErrorBoundMs = a.ErrorBoundMs is { } e && double.IsFinite(e) ? e : null,
                Synchronized = a.Synchronized,
                ReceivedAtUtc = now
            });
            accepted++;

            // The worst uncertainty seen during a run is what its replay must admit to.
            if (await RobotRuns.AtAsync(db, code, a.UtcEstimate, ct) is { } run)
            {
                var bound = a.Synchronized ? a.ErrorBoundMs ?? 0 : double.PositiveInfinity;
                if (double.IsFinite(bound))
                {
                    run.TimeSyncErrorBoundMs = Math.Max(run.TimeSyncErrorBoundMs ?? 0, bound);
                    run.ClockOffsetEstimateMs = a.OffsetMs;
                }
                else
                {
                    run.TimeSyncErrorBoundMs = 1e9; // not synchronized: the replay shows "sync uncertain"
                }
            }
        }

        await db.SaveChangesAsync(ct);
        return Results.Ok(new BatchAccepted(accepted, request.Anchors.Count - accepted));
    }

    private static string Bounded(string? text, int max) =>
        string.IsNullOrEmpty(text) ? string.Empty : text.Length <= max ? text : text[..max];
}
