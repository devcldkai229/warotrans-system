using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Evidence.Recorder.Services;

/// <summary>
/// A Technician sees only journals that involve a robot in their scope (Identity's technician_robot_scopes). The scope
/// is read from Identity with the caller's own token and cached briefly. If Identity cannot answer, a Technician sees
/// nothing (fail closed); other roles see every robot.
/// </summary>
internal sealed class RobotVisibility(CoreApiClient core, IMemoryCache cache, ILogger<RobotVisibility> logger)
{
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(60);

    public sealed record Scope(bool AllRobots, IReadOnlySet<Guid> RobotIds)
    {
        public static readonly Scope Everything = new(true, new HashSet<Guid>());
        public static readonly Scope Nothing = new(false, new HashSet<Guid>());

        public bool Allows(IEnumerable<Guid?> robots) => AllRobots || robots.Any(r => r is { } id && RobotIds.Contains(id));
    }

    public async Task<Scope> ForAsync(HttpContext context, CancellationToken cancellationToken)
    {
        if (!context.User.IsInRole(AppRoles.Technician))
        {
            return Scope.Everything;
        }

        var token = BearerToken(context);
        if (token is null)
        {
            return Scope.Nothing;
        }

        var key = ("robot-scope", Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))));
        if (cache.TryGetValue(key, out Scope? cached) && cached is not null)
        {
            return cached;
        }

        try
        {
            var capabilities = await core.GetCapabilitiesAsync(token, cancellationToken);
            var scope = new Scope(capabilities.RobotScope.AllRobots, capabilities.RobotScope.RobotIds.ToHashSet());
            cache.Set(key, scope, CacheFor);
            return scope;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Evidence: could not read the robot scope of {User}; showing nothing", context.User.FindFirstValue("sub"));
            return Scope.Nothing;
        }
    }

    private static string? BearerToken(HttpContext context)
    {
        var header = context.Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return header[7..].Trim();
        }

        var query = context.Request.Query["access_token"].ToString();
        return string.IsNullOrEmpty(query) ? null : query;
    }
}
