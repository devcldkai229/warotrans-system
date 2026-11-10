using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Security;

/// <summary>
/// Scoped per request. Only a Technician is limited (to the rows of <c>technician_robot_scopes</c>); what any
/// role may do at all is still decided by its permissions.
/// </summary>
internal sealed class RobotAccessScope(IHttpContextAccessor httpContextAccessor, IdentityDbContext dbContext) : IRobotAccessScope
{
    private RobotScope? _current;

    public async Task<RobotScope> GetCurrentAsync(CancellationToken cancellationToken = default) =>
        _current ??= httpContextAccessor.HttpContext?.User is { } user
            ? await GetForAsync(user, cancellationToken)
            : RobotScope.Nothing;

    public async Task<RobotScope> GetForAsync(ClaimsPrincipal user, CancellationToken cancellationToken = default)
    {
        if (user.Identity?.IsAuthenticated != true)
        {
            return RobotScope.Nothing;
        }

        if (!user.IsInRole(AppRoles.Technician))
        {
            return RobotScope.Everything;
        }

        var subject = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue(AppClaimTypes.Subject);
        if (!Guid.TryParse(subject, out var accountId))
        {
            return RobotScope.Nothing;
        }

        var robotIds = await dbContext.TechnicianRobotScopes
            .AsNoTracking()
            .Where(s => s.AccountId == accountId)
            .Select(s => s.RobotId)
            .ToListAsync(cancellationToken);

        return new RobotScope(false, robotIds.ToHashSet());
    }
}
