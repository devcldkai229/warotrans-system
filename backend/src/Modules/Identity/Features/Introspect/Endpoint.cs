using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Identity.Features.Introspect;

/// <param name="Subject">Account id (JWT <c>sub</c>).</param>
/// <param name="Permissions">Exactly what the server enforces for this token; empty while the password is temporary.</param>
/// <param name="RobotScope">Robots the caller may see and act on (a Technician is limited to assigned robots).</param>
/// <param name="ExpiresAt">When this access token stops being accepted (JWT <c>exp</c>).</param>
internal sealed record IntrospectResponse(
    Guid Subject,
    string Username,
    string Role,
    IReadOnlyList<string> Permissions,
    IntrospectRobotScope RobotScope,
    DateTimeOffset? ExpiresAt);

internal sealed record IntrospectRobotScope(bool AllRobots, IReadOnlyList<Guid> RobotIds);

/// <summary>
/// For services that act on behalf of a WaroTrans user (WaroTrans.AI, the Evidence Recorder): validates the caller's
/// token here, where the signing key lives, and answers who it is and what it may do. Read-only, no side effects.
/// </summary>
internal static class IntrospectEndpoint
{
    public static void MapIntrospect(this IEndpointRouteBuilder group) =>
        group.MapGet("/introspect", async (
                ClaimsPrincipal user,
                ICurrentUser currentUser,
                IRobotAccessScope robotAccessScope,
                CancellationToken cancellationToken) =>
            {
                if (currentUser.AccountId is not { } accountId || currentUser.Role is not { } role)
                {
                    return Results.Problem(statusCode: StatusCodes.Status401Unauthorized);
                }

                var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
                var permissions = user.IsPasswordChangeRequired() ? [] : RolePermissionMatrix.PermissionsOf(role);
                return TypedResults.Ok(new IntrospectResponse(
                    accountId,
                    user.FindFirstValue(AppClaimTypes.Name) ?? string.Empty,
                    role,
                    permissions,
                    new IntrospectRobotScope(scope.AllRobots, scope.RobotIds.Order().ToList()),
                    ExpiresAt(user)));
            })
            .RequireAuthorization()
            .AllowWhilePasswordChangeRequired()
            .WithName("IntrospectToken")
            .WithSummary("Who this token belongs to and what it may do (for services acting for a user)")
            .Produces<IntrospectResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized);

    internal static DateTimeOffset? ExpiresAt(ClaimsPrincipal user) =>
        long.TryParse(user.FindFirstValue("exp"), out var exp)
            ? DateTimeOffset.FromUnixTimeSeconds(exp)
            : null;
}
