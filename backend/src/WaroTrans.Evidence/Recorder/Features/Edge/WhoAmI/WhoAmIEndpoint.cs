using System.Security.Claims;
using WaroTrans.Evidence.Recorder.Services;

namespace WaroTrans.Evidence.Recorder.Features.Edge.WhoAmI;

public sealed record RobotWhoAmIResponse(string RobotCode, DateTimeOffset ServerTimeUtc);

/// <summary>A robot checks its credential and reads the server clock (readiness / clock skew check).</summary>
internal static class WhoAmIEndpoint
{
    public static void Map(RouteGroupBuilder group) =>
        group.MapGet("/edge/whoami", (ClaimsPrincipal user, TimeProvider clock) =>
                Results.Ok(new RobotWhoAmIResponse(user.RobotCode()!, clock.GetUtcNow())))
            .RequireAuthorization(RobotAuthenticationHandler.Policy)
            .WithName("EvidenceRobotWhoAmI");
}
