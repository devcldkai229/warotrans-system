using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.PoseHistory;

/// <summary>Query of GET /robots/{id}/pose-history: a time range, or one Job (its whole run unless a range narrows it).</summary>
public sealed record GetRobotPoseHistoryRequest(DateTimeOffset? From, DateTimeOffset? To, Guid? JobId, int? Limit);

public sealed record RobotPosePoint(
    DateTimeOffset At,
    double X,
    double Y,
    double Yaw,
    double? LinearVelocity,
    double? AngularVelocity,
    string? MapVersionCode,
    Guid? JobId,
    Guid? CommandId);

/// <param name="From">Start of the range read (for a Job without a range: its first point).</param>
/// <param name="Total">Points the filters match.</param>
/// <param name="Downsampled">More points matched than <c>limit</c>: every n-th is returned, first and last kept.</param>
/// <param name="DistanceMeters">Length of the path through all matching points, not only the returned ones.</param>
/// <param name="KeptSince">Older points have been deleted (<c>Fleet:History:PoseRetentionDays</c>).</param>
public sealed record RobotPoseHistoryResponse(
    Guid RobotId,
    DateTimeOffset? From,
    DateTimeOffset? To,
    Guid? JobId,
    int Total,
    bool Downsampled,
    double DistanceMeters,
    DateTimeOffset KeptSince,
    IReadOnlyList<RobotPosePoint> Points);

/// <summary>FE-09 / FE-19 / SDD 3.3.5: the movement history of a robot, oldest point first.</summary>
public sealed class GetRobotPoseHistoryHandler(FleetDbContext db, IOptions<RobotHistoryOptions> options, TimeProvider clock)
{
    public const int DefaultLimit = 2000;
    public const int MaxLimit = 10_000;
    public static readonly TimeSpan DefaultRange = TimeSpan.FromHours(1);
    public static readonly TimeSpan MaxRange = TimeSpan.FromDays(7);

    public async Task<RobotPoseHistoryResponse> HandleAsync(
        Guid robotId,
        GetRobotPoseHistoryRequest request,
        CancellationToken cancellationToken = default)
    {
        var limit = request.Limit ?? DefaultLimit;
        if (limit is < 2 or > MaxLimit)
        {
            throw new DomainValidationException($"limit must be between 2 and {MaxLimit}.", "pose_history_limit_invalid");
        }

        var now = clock.GetUtcNow();
        var keptSince = now.AddDays(-Math.Max(1, options.Value.PoseRetentionDays));
        DateTimeOffset? from = request.From;
        DateTimeOffset? to = request.To;
        if (request.JobId is null)
        {
            // A robot's history has no natural end: without a Job the range is required to stay bounded.
            to ??= now;
            from ??= to.Value - DefaultRange;
        }

        if (from is { } start && to is { } end)
        {
            if (start >= end)
            {
                throw new DomainValidationException("from must be before to.", "pose_history_range_invalid");
            }

            if (request.JobId is null && end - start > MaxRange)
            {
                throw new DomainValidationException(
                    $"The range may not exceed {MaxRange.TotalDays:0} days; pick a Job or a shorter range.",
                    "pose_history_range_too_long");
            }
        }

        if (!await db.Robots.AsNoTracking().AnyAsync(r => r.Id == robotId, cancellationToken))
        {
            throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
        }

        var query = db.RobotPoseSamples.AsNoTracking().Where(p => p.RobotId == robotId);
        if (request.JobId is { } jobId) query = query.Where(p => p.JobId == jobId);
        if (from is { } lower) query = query.Where(p => p.RecordedAt >= lower);
        if (to is { } upper) query = query.Where(p => p.RecordedAt <= upper);

        // Positions only, to measure the whole path and pick evenly spaced points without loading every column.
        var all = await query
            .OrderBy(p => p.RecordedAt)
            .Select(p => new { p.Id, p.X, p.Y, p.MapVersionCode })
            .ToListAsync(cancellationToken);

        var distance = 0.0;
        for (var i = 1; i < all.Count; i++)
        {
            if (all[i].MapVersionCode == all[i - 1].MapVersionCode)
            {
                distance += Math.Sqrt(Math.Pow(all[i].X - all[i - 1].X, 2) + Math.Pow(all[i].Y - all[i - 1].Y, 2));
            }
        }

        var downsampled = all.Count > limit;
        var wanted = (downsampled ? Pick(all.Count, limit) : Enumerable.Range(0, all.Count))
            .Select(i => all[i].Id)
            .ToList();

        var points = new List<RobotPosePoint>(wanted.Count);
        foreach (var chunk in wanted.Chunk(1000))
        {
            points.AddRange(await db.RobotPoseSamples.AsNoTracking()
                .Where(p => chunk.Contains(p.Id))
                .Select(p => new RobotPosePoint(
                    p.RecordedAt, p.X, p.Y, p.Yaw, p.LinearVelocity, p.AngularVelocity, p.MapVersionCode, p.JobId, p.CommandId))
                .ToListAsync(cancellationToken));
        }

        points.Sort((a, b) => a.At.CompareTo(b.At));
        return new RobotPoseHistoryResponse(
            robotId,
            from ?? points.FirstOrDefault()?.At,
            to ?? points.LastOrDefault()?.At,
            request.JobId,
            all.Count,
            downsampled,
            Math.Round(distance, 2),
            keptSince,
            points);
    }

    /// <summary><paramref name="limit"/> indexes spread evenly over 0 … count−1, both ends included.</summary>
    public static IEnumerable<int> Pick(int count, int limit)
    {
        var step = (count - 1) / (double)(limit - 1);
        return Enumerable.Range(0, limit).Select(i => (int)Math.Round(i * step)).Distinct();
    }
}

public static class GetRobotPoseHistoryEndpoint
{
    public static RouteGroupBuilder MapGetRobotPoseHistory(this RouteGroupBuilder group)
    {
        group.MapGet("/robots/{id:guid}/pose-history", async (
                Guid id,
                DateTimeOffset? from,
                DateTimeOffset? to,
                Guid? jobId,
                int? limit,
                GetRobotPoseHistoryHandler handler,
                CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, new GetRobotPoseHistoryRequest(from, to, jobId, limit), cancellationToken)))
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetRobotPoseHistory")
            .WithSummary("Where a robot went: its movement history, oldest point first")
            .WithDescription("Either a time range (`from`/`to`, default the last hour, at most 7 days) or a `jobId` (the whole run of that Job, narrowed by `from`/`to` if given). At most `limit` points (default 2000, max 10000): beyond that every n-th point is returned and `downsampled` is true. `distanceMeters` is measured over all matching points. Points older than `keptSince` have been deleted.")
            .WithTags("Robots");

        return group;
    }
}
