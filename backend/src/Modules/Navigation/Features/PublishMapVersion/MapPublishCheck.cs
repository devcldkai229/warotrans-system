using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.PublishMapVersion;

public sealed record MapPublishCheckResponse(
    Guid MapVersionId,
    string MapCode,
    IReadOnlyList<string> ReplacedMapCodes,
    IReadOnlyList<MapPublishIssue> Issues)
{
    /// <summary>No BLOCK at all: publish as is.</summary>
    public bool CanPublish => Issues.All(i => i.Severity != MapPublishSeverity.Block);

    /// <summary>Only overridable BLOCKs: an Admin may publish anyway, with a reason.</summary>
    public bool CanOverride => !CanPublish && Issues.Where(i => i.Severity == MapPublishSeverity.Block).All(i => i.Overridable);
}

/// <summary>
/// What publishing a map version would break or change, from every module (IMapPublishGuard), like OTTO's publish
/// warnings: workflows that name places the new map lacks, Jobs still running on the old map, waiting requests, robots.
/// </summary>
public sealed class MapPublishCheck(
    NavigationDbContext dbContext,
    IEnumerable<IMapPublishGuard> guards,
    IEnumerable<IMapPublishFollower> followers,
    ILogger<MapPublishCheck> logger)
{
    public async Task<(MapVersion Map, MapPublishContext Context, List<string> ReplacedCodes)> ContextAsync(
        Guid mapVersionId, CancellationToken cancellationToken)
    {
        var map = await dbContext.MapVersions.AsNoTracking().FirstOrDefaultAsync(m => m.Id == mapVersionId, cancellationToken)
            ?? throw new NotFoundException($"MapVersion with ID '{mapVersionId}' was not found.", "map_version_not_found");
        var replaced = await dbContext.MapVersions.AsNoTracking()
            .Where(m => m.WarehouseId == map.WarehouseId && m.Status == MapStatus.PUBLISHED && m.Id != map.Id)
            .Select(m => new { m.Id, m.Code })
            .ToListAsync(cancellationToken);
        return (map, new MapPublishContext(map.WarehouseId, map.Id, map.Code, replaced.Select(r => r.Id).ToList()),
            replaced.Select(r => r.Code).ToList());
    }

    public async Task<MapPublishCheckResponse> CheckAsync(Guid mapVersionId, CancellationToken cancellationToken)
    {
        var (map, context, replacedCodes) = await ContextAsync(mapVersionId, cancellationToken);
        var issues = new List<MapPublishIssue>();
        foreach (var guard in guards)
        {
            issues.AddRange(await guard.CheckAsync(context, cancellationToken));
        }

        return new MapPublishCheckResponse(map.Id, map.Code, replacedCodes,
            issues.OrderBy(i => i.Severity switch { MapPublishSeverity.Block => 0, MapPublishSeverity.Warn => 1, _ => 2 })
                .ThenBy(i => i.Code).ToList());
    }

    /// <summary>
    /// Refuses the publish on a BLOCK: always when it is not overridable (Jobs running), otherwise unless
    /// <paramref name="force"/> with a reason.
    /// </summary>
    public async Task EnsurePublishableAsync(Guid mapVersionId, bool force, string? reason, CancellationToken cancellationToken)
    {
        var check = await CheckAsync(mapVersionId, cancellationToken);
        if (check.CanPublish) return;
        var blocks = check.Issues.Where(i => i.Severity == MapPublishSeverity.Block).ToList();
        if (!check.CanOverride)
        {
            throw new ConflictException(
                "Publishing is refused: " + string.Join(" ", blocks.Where(b => !b.Overridable).Select(b => b.Message)),
                "map_publish_blocked");
        }

        if (!force)
        {
            throw new ConflictException(
                $"Publishing {check.MapCode} would break {blocks.Count} thing(s): " + string.Join(" ", blocks.Select(b => b.Message)),
                "map_publish_needs_confirmation");
        }

        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < 5)
        {
            throw new DomainValidationException("Give a reason (5+ characters) to publish anyway.", "map_publish_reason_required");
        }

        logger.LogWarning("Map {MapCode} published over {Count} blocking issue(s), reason: {Reason}. {Issues}",
            check.MapCode, blocks.Count, reason.Trim(), string.Join(" | ", blocks.Select(b => b.Message)));
    }

    public async Task FollowAsync(MapPublishContext context, CancellationToken cancellationToken)
    {
        foreach (var follower in followers)
        {
            try
            {
                await follower.OnPublishedAsync(context, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // The map is published; a follower that failed leaves its items on the old map, where the next
                // publish check lists them again. It must not undo the publish.
                logger.LogError(ex, "Map {MapCode} published, but {Follower} failed", context.NewMapCode, follower.GetType().Name);
            }
        }
    }
}
