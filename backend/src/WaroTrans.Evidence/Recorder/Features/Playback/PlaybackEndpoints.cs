using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Services;
using WaroTrans.Evidence.Storage;

namespace WaroTrans.Evidence.Recorder.Features.Playback;

public sealed record SpanResponse(Guid MediaAssetId, DateTimeOffset UtcStart, DateTimeOffset UtcEnd, long MediaStartMs, long MediaEndMs,
    float? TimeErrorBoundMs, string MappingMethod);

public sealed record AssetResponse(Guid Id, Guid ContinuityGroupId, string Status, string ProfileVersion, long? DurationMs,
    DateTimeOffset? ReadyAtUtc, string? FailureReason);

public sealed record GapResponse(DateTimeOffset FromUtc, DateTimeOffset ToUtc, string Reason);

public sealed record RecordingSpansResponse(
    Guid RecordingId,
    Guid RunId,
    string CameraId,
    string CameraModel,
    float? NominalFovDegrees,
    string Status,
    DateTimeOffset StartedAtUtc,
    DateTimeOffset? EndedAtUtc,
    IReadOnlyList<AssetResponse> Assets,
    IReadOnlyList<SpanResponse> Spans,
    IReadOnlyList<GapResponse> Gaps);

/// <summary>
/// What a player needs for one camera recording (spec §10.3): its assets, the measured UTC ↔ media mapping, and every
/// hole (before the first frame, between groups, a quarantined segment, a processing failure) so the UI shows "no
/// video at this time" instead of a frozen frame. And a short-lived, audited grant to play one asset.
/// </summary>
internal static class PlaybackEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/recordings/{recordingId:guid}/spans", SpansAsync)
            .RequirePermission(Permissions.EvidenceRead)
            .WithName("GetRecordingSpans");
        api.MapPost("/media/{assetId:guid}/playback-grant", GrantAsync)
            .RequirePermission(Permissions.EvidencePlayback)
            .WithName("GrantPlayback");
    }

    private static async Task<IResult> SpansAsync(Guid recordingId, HttpContext http, EvidenceDbContext db, RobotVisibility visibility, CancellationToken ct)
    {
        var recording = await db.Recordings.AsNoTracking().Include(r => r.Run).FirstOrDefaultAsync(r => r.Id == recordingId, ct);
        if (recording is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "No such recording.");
        }

        if (!(await visibility.ForAsync(http, ct)).Allows([recording.Run.RobotSourceId]))
        {
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "This robot is not in your scope.");
        }

        var assets = await db.MediaAssets.AsNoTracking().Where(a => a.RecordingId == recordingId).OrderBy(a => a.CreatedAtUtc).ToListAsync(ct);
        var ready = assets.Where(a => a.Status == MediaAssetStatus.READY).Select(a => a.Id).ToHashSet();
        var spans = (await db.PlaybackSpans.AsNoTracking().Where(s => s.RecordingId == recordingId).ToListAsync(ct))
            .Where(s => ready.Contains(s.MediaAssetId))
            .OrderBy(s => s.UtcStart)
            .ToList();
        var gaps = new List<GapResponse>();
        var cursor = recording.StartedAtUtc;
        foreach (var span in spans)
        {
            if (span.UtcStart - cursor > TimeSpan.FromSeconds(1))
            {
                gaps.Add(new GapResponse(cursor, span.UtcStart, cursor == recording.StartedAtUtc ? "NOT_YET_RECORDED" : "NO_VIDEO"));
            }

            cursor = span.UtcEnd > cursor ? span.UtcEnd : cursor;
        }

        var end = recording.EndedAtUtc ?? recording.LastHeartbeatAtUtc ?? cursor;
        if (end - cursor > TimeSpan.FromSeconds(1))
        {
            gaps.Add(new GapResponse(cursor, end, assets.Any(a => a.Status is MediaAssetStatus.QUEUED or MediaAssetStatus.PROCESSING or MediaAssetStatus.PENDING)
                ? "PROCESSING" : "NO_VIDEO"));
        }

        return Results.Ok(new RecordingSpansResponse(
            recording.Id, recording.RobotRunEvidenceId, recording.CameraId, recording.CameraModel, recording.NominalFovDegrees,
            recording.Status.ToString(), recording.StartedAtUtc, recording.EndedAtUtc,
            assets.Select(a => new AssetResponse(a.Id, a.ContinuityGroupId, a.Status.ToString(), a.ProfileVersion, a.DurationMs, a.ReadyAtUtc, a.FailureReason)).ToList(),
            spans.Select(s => new SpanResponse(s.MediaAssetId, s.UtcStart, s.UtcEnd, s.MediaStartMs, s.MediaEndMs, s.TimeErrorBoundMs, s.MappingMethod)).ToList(),
            gaps));
    }

    private static async Task<IResult> GrantAsync(
        Guid assetId, HttpContext http, EvidenceDbContext db, RobotVisibility visibility, IPlaybackSigner signer,
        AccessAuditWriter audit, IOptions<PlaybackOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var asset = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(a => a.Id == assetId, ct);
        if (asset is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "No such media.");
        }

        var recording = await db.Recordings.AsNoTracking().Include(r => r.Run).FirstAsync(r => r.Id == asset.RecordingId, ct);
        if (!(await visibility.ForAsync(http, ct)).Allows([recording.Run.RobotSourceId]))
        {
            audit.Add(AccessAction.PLAY, AccessResult.DENIED, recording.Run.JournalId, asset.Id, "robot_out_of_scope");
            await db.SaveChangesAsync(ct);
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "This robot is not in your scope.");
        }

        if (asset.Status != MediaAssetStatus.READY || asset.OutputPrefix is null || asset.MasterPlaylistKey is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: $"Video not ready ({asset.Status}).",
                extensions: new Dictionary<string, object?> { ["code"] = "media_not_ready", ["status"] = asset.Status.ToString() });
        }

        var expires = clock.GetUtcNow().AddMinutes(Math.Clamp(options.Value.GrantMinutes, 1, 60));
        var grant = await signer.GrantAsync(asset.OutputPrefix, asset.MasterPlaylistKey, expires, ct);
        if (grant.Cookies is { } cookies)
        {
            foreach (var (name, value) in cookies)
            {
                http.Response.Cookies.Append(name, value, new CookieOptions
                {
                    Domain = options.Value.CookieDomain,
                    Path = "/" + asset.OutputPrefix,
                    Secure = true,
                    HttpOnly = true,
                    SameSite = SameSiteMode.None,
                    Expires = expires
                });
            }
        }

        audit.Add(AccessAction.PLAY, AccessResult.ALLOWED, recording.Run.JournalId, asset.Id);
        await db.SaveChangesAsync(ct);
        return Results.Ok(grant with { Cookies = null });
    }
}

/// <summary>Local provider only: serves an asset's HLS files when the grant's signature covers them.</summary>
internal static class LocalPlaybackEndpoint
{
    private static readonly FileExtensionContentTypeProvider Types = new()
    {
        Mappings = { [".m3u8"] = "application/vnd.apple.mpegurl", [".ts"] = "video/mp2t", [".m4s"] = "video/iso.segment" }
    };

    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGet(LocalPlaybackSigner.Path + "{**key}", (string key, string prefix, long exp, string sig, LocalPlaybackSigner signer,
                EvidenceStorageOptions storage) =>
            {
                if (!signer.Verify(key, prefix, exp, sig))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var path = Path.GetFullPath(Path.Combine(storage.LocalRootPath, key));
                if (!path.StartsWith(storage.LocalRootPath, StringComparison.Ordinal) || !File.Exists(path))
                {
                    return Results.NotFound();
                }

                Types.TryGetContentType(path, out var type);
                return Results.File(path, type ?? "application/octet-stream", enableRangeProcessing: true);
            })
            .AllowAnonymous()
            .WithName("EvidenceLocalPlayback");
}
