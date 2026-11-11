using System.Collections.Frozen;
using System.Security.Claims;

namespace WaroTrans.BuildingBlocks.Authorization;

/// <summary>
/// The single place that decides which role may do what (deny by default). Kept in code so it is reviewed,
/// versioned and unit tested; a role change revokes the account's sessions, so the next token carries it.
/// </summary>
public static class RolePermissionMatrix
{
    private static readonly FrozenDictionary<string, FrozenSet<string>> Matrix =
        new Dictionary<string, FrozenSet<string>>(StringComparer.Ordinal)
        {
            [AppRoles.Admin] = Permissions.All.ToFrozenSet(StringComparer.Ordinal),

            // Warehouse floor: receives goods, raises and follows transport requests, confirms handovers.
            // May stop a robot (safety), never drive or reconfigure one.
            [AppRoles.Staff] = new[]
            {
                Permissions.MapRead,
                Permissions.WarehouseRead, Permissions.ContainerCreate, Permissions.ContainerRecover, Permissions.VoucherWrite,
                Permissions.TransportRead, Permissions.TransportCreate,
                Permissions.WorkflowRead, Permissions.JobRead, Permissions.JobOperate, Permissions.JobPause,
                Permissions.RobotRead, Permissions.RobotStop,
                Permissions.IssueRead, Permissions.IssueCreate,
                Permissions.NotificationRead
            }.ToFrozenSet(StringComparer.Ordinal),

            // Robot technician: robot-level rights, limited to the robots in their scope (IRobotAccessScope).
            // No account, stock, transport or map authoring rights, and no way to bypass safety.
            [AppRoles.Technician] = new[]
            {
                Permissions.ConsoleAccess,
                Permissions.MapRead,
                Permissions.WarehouseRead,
                Permissions.TransportRead,
                Permissions.WorkflowRead, Permissions.JobRead, Permissions.JobPause,
                Permissions.RobotRead, Permissions.RobotConfigure, Permissions.RobotCommand, Permissions.RobotStop,
                Permissions.RobotManualDrive, Permissions.RobotMaintenance, Permissions.RobotPower,
                Permissions.RobotDiagnostics,
                Permissions.TrafficRead, Permissions.TrafficManage,
                Permissions.IssueRead, Permissions.IssueCreate, Permissions.IssueManage,
                Permissions.AuditRead,
                Permissions.NotificationRead
            }.ToFrozenSet(StringComparer.Ordinal)
        }.ToFrozenDictionary(StringComparer.Ordinal);

    public static bool RoleHas(string? role, string permission) =>
        role is not null && Matrix.TryGetValue(role, out var permissions) && permissions.Contains(permission);

    /// <summary>Permissions of a role, sorted; empty for an unknown role.</summary>
    public static IReadOnlyList<string> PermissionsOf(string? role) =>
        role is not null && Matrix.TryGetValue(role, out var permissions)
            ? permissions.Order(StringComparer.Ordinal).ToArray()
            : [];

    /// <summary>
    /// Asks the identity whether it is in each known role, so it works whatever claim type the authentication
    /// scheme uses for roles (JWT "role" in production, <see cref="ClaimTypes.Role"/> in tests).
    /// </summary>
    public static bool UserHas(ClaimsPrincipal user, string permission) =>
        AppRoles.All.Any(role => user.IsInRole(role) && RoleHas(role, permission));
}
