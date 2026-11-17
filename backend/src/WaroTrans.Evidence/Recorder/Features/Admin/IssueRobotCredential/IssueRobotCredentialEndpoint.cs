using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Services;

namespace WaroTrans.Evidence.Recorder.Features.Admin.IssueRobotCredential;

public sealed record RobotCredentialResponse(string RobotCode, string Token, string AuthorizationHeader, DateTimeOffset CreatedAtUtc);

/// <summary>
/// Gives a robot a new recording credential and revokes the old ones. The token is in this response only (it is stored
/// hashed): put it in the robot's env file, never in a repository.
/// </summary>
internal static partial class IssueRobotCredentialEndpoint
{
    [GeneratedRegex("^[A-Z0-9][A-Z0-9-]{0,63}$")]
    private static partial Regex RobotCodePattern();

    public static void Map(RouteGroupBuilder group) =>
        group.MapPost("/admin/robots/{robotCode}/credentials", async (
                string robotCode,
                ClaimsPrincipal user,
                EvidenceDbContext db,
                AccessAuditWriter audit,
                TimeProvider clock,
                CancellationToken ct) =>
            {
                if (!RobotCodePattern().IsMatch(robotCode))
                {
                    return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Robot code must look like RBT-001.");
                }

                var now = clock.GetUtcNow();
                await db.RobotCredentials
                    .Where(c => c.RobotCode == robotCode && c.RevokedAtUtc == null)
                    .ExecuteUpdateAsync(s => s.SetProperty(c => c.RevokedAtUtc, now), ct);
                var token = Base64Url(RandomNumberGenerator.GetBytes(32));
                db.RobotCredentials.Add(new RobotCredential
                {
                    Id = Guid.NewGuid(),
                    RobotCode = robotCode,
                    TokenSha256 = RobotAuthenticationHandler.Sha256Hex(token),
                    IssuedBy = Guid.TryParse(user.FindFirstValue(AppClaimTypes.Subject), out var id) ? id : null,
                    CreatedAtUtc = now
                });
                audit.Add(AccessAction.GRANT, AccessResult.ALLOWED, null, detail: $"robot credential issued for {robotCode}");
                await db.SaveChangesAsync(ct);
                return Results.Ok(new RobotCredentialResponse(robotCode, token, $"{RobotAuthenticationHandler.SchemeName} {robotCode}.{token}", now));
            })
            .RequirePermission(Permissions.EvidenceAdmin)
            .WithName("IssueRobotCredential")
            .WithSummary("Issue a robot's recording credential (shown once) and revoke its previous ones.");

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
