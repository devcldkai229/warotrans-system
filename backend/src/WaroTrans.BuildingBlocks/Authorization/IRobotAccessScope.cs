using System.Security.Claims;

namespace WaroTrans.BuildingBlocks.Authorization;

/// <summary>Which robots the signed-in user may act on. Everyone but a Technician sees the whole fleet.</summary>
public sealed record RobotScope(bool AllRobots, IReadOnlyCollection<Guid> RobotIds)
{
    public static readonly RobotScope Everything = new(true, []);
    public static readonly RobotScope Nothing = new(false, []);

    public bool Allows(Guid robotId) => AllRobots || RobotIds.Contains(robotId);
}

/// <summary>Implemented by Identity, which owns the Technician ↔ robot assignments.</summary>
public interface IRobotAccessScope
{
    /// <summary>Scope of the user of the current HTTP request.</summary>
    Task<RobotScope> GetCurrentAsync(CancellationToken cancellationToken = default);

    /// <summary>Scope of any principal, e.g. a SignalR connection's user.</summary>
    Task<RobotScope> GetForAsync(ClaimsPrincipal user, CancellationToken cancellationToken = default);

    async Task<bool> CanAccessRobotAsync(Guid robotId, CancellationToken cancellationToken = default) =>
        (await GetCurrentAsync(cancellationToken)).Allows(robotId);
}
