using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Identity.Features.ListRoles;

/// <param name="Role">The role name, as it appears on an account.</param>
/// <param name="Permissions">Every permission the role holds, sorted: exactly what the server enforces for it.</param>
/// <param name="RobotScoped">Whether the role's robot permissions are limited to the robots assigned to each account.</param>
internal sealed record RoleResponse(string Role, IReadOnlyList<string> Permissions, bool RobotScoped);

/// <param name="Roles">Every role, in the order accounts can be given them.</param>
/// <param name="AllPermissions">Every permission the API protects, so a screen can show what a role does not have.</param>
internal sealed record ListRolesResponse(IReadOnlyList<RoleResponse> Roles, IReadOnlyList<string> AllPermissions);

/// <summary>
/// WEB-MGMT-01: the role-permission matrix as data. Roles are code-only (no Role table), so this reads
/// <see cref="RolePermissionMatrix"/>, the one place that decides who may do what, and never a second copy of it.
/// </summary>
internal static class ListRolesEndpoint
{
    public static void MapListRoles(this IEndpointRouteBuilder group) =>
        group.MapGet("/roles", () =>
                TypedResults.Ok(new ListRolesResponse(
                    AppRoles.All
                        .Select(role => new RoleResponse(role, RolePermissionMatrix.PermissionsOf(role), AppRoles.IsRobotScoped(role)))
                        .ToList(),
                    Permissions.All.Order(StringComparer.Ordinal).ToList())))
            .RequirePermission(Permissions.UserManage)
            .WithName("ListRoles")
            .WithSummary("The roles and the permissions each one holds")
            .Produces<ListRolesResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);
}
