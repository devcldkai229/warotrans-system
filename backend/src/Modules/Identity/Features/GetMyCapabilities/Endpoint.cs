using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Identity.Features.GetMyCapabilities;

/// <param name="Permissions">Exactly what the server enforces for this token (see RolePermissionMatrix).</param>
/// <param name="RobotScope">Robots the caller may act on; <c>AllRobots</c> for everyone but a Technician.</param>
internal sealed record CapabilitiesResponse(
    Guid AccountId,
    string Role,
    bool MustChangePassword,
    IReadOnlyList<string> Permissions,
    RobotScopeResponse RobotScope);

internal sealed record RobotScopeResponse(bool AllRobots, IReadOnlyList<Guid> RobotIds);

/// <summary>
/// The shared contract Web and App render from (BOTH-07): clients show or hide actions from this list instead of
/// comparing role names. It is derived from the token, i.e. from what the server will actually enforce.
/// </summary>
internal static class GetMyCapabilitiesEndpoint
{
    public static void MapGetMyCapabilities(this IEndpointRouteBuilder group) =>
        group.MapGet("/me/capabilities", async (
                ClaimsPrincipal user,
                ICurrentUser currentUser,
                IRobotAccessScope robotAccessScope,
                CancellationToken cancellationToken) =>
            {
                if (currentUser.AccountId is not { } accountId || currentUser.Role is not { } role)
                {
                    return Results.Problem(statusCode: StatusCodes.Status401Unauthorized);
                }

                var mustChangePassword = user.IsPasswordChangeRequired();
                var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
                return TypedResults.Ok(new CapabilitiesResponse(
                    accountId,
                    role,
                    mustChangePassword,
                    // A temporary password opens nothing but "change password", so no permission is advertised.
                    mustChangePassword ? [] : RolePermissionMatrix.PermissionsOf(role),
                    new RobotScopeResponse(scope.AllRobots, scope.RobotIds.Order().ToList())));
            })
            .RequireAuthorization()
            .AllowWhilePasswordChangeRequired()
            .WithName("GetMyCapabilities")
            .Produces<CapabilitiesResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized);
}
