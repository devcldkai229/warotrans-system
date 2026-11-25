using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Contracts;

namespace WaroTrans.Fleet.Features.ChangeRobotMap;

/// <summary>
/// The robot side of publishing a map: robots still assigned to the old map (they take no Job on the new one until
/// moved: Fleet → Move all to MAP-…) and robot home endpoints (Traffic:RobotHomeEndpoints) the new map lacks.
/// Warnings only: robots are moved after publishing, and localized again on the new map.
/// </summary>
public sealed class FleetMapPublishGuard(
    FleetDbContext db,
    INavigationModule navigation,
    IOptions<TrafficOptions>? traffic = null) : IMapPublishGuard
{
    public async Task<IReadOnlyList<MapPublishIssue>> CheckAsync(MapPublishContext context, CancellationToken cancellationToken = default)
    {
        var issues = new List<MapPublishIssue>();
        var robots = await db.Robots.AsNoTracking()
            .Where(r => r.WarehouseId == context.WarehouseId)
            .Select(r => new { r.Code, r.CurrentMapVersionId, r.IsEnabled })
            .ToListAsync(cancellationToken);
        var onOld = robots.Where(r => r.IsEnabled && context.ReplacedMapVersionIds.Contains(r.CurrentMapVersionId)).Select(r => r.Code).ToList();
        if (onOld.Count > 0)
        {
            issues.Add(new MapPublishIssue(MapPublishSeverity.Warn, "robots_on_old_map",
                $"{onOld.Count} robot(s) ({string.Join(", ", onOld)}) stay on the current map: move them to {context.NewMapCode} after publishing (Fleet), then localize them.",
                string.Join(", ", onOld),
                Args: new Dictionary<string, string> { ["count"] = onOld.Count.ToString(), ["robots"] = string.Join(", ", onOld), ["map"] = context.NewMapCode }));
        }

        if (traffic?.Value.RobotHomeEndpoints is { Count: > 0 } homes)
        {
            foreach (var robot in robots)
            {
                if (!homes.TryGetValue(robot.Code, out var code) || string.IsNullOrWhiteSpace(code)) continue;
                if (await navigation.GetEndpointPoseByCodeAsync(context.NewMapVersionId, code, cancellationToken) is null)
                {
                    issues.Add(new MapPublishIssue(MapPublishSeverity.Warn, "robot_home_missing",
                        $"{robot.Code}'s home endpoint {code} (Traffic:RobotHomeEndpoints) is not on {context.NewMapCode}: its Jobs will be refused (robot_home_not_on_map).",
                        robot.Code,
                        Args: new Dictionary<string, string> { ["robot"] = robot.Code, ["place"] = code, ["map"] = context.NewMapCode }));
                }
            }
        }

        return issues;
    }
}
