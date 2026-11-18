using System.Security.Claims;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;

namespace WaroTrans.Evidence.Recorder.Services;

/// <summary>Records who viewed, played, exported, annotated or was refused (spec §4.13). Saved with the caller's change.</summary>
internal sealed class AccessAuditWriter(EvidenceDbContext db, IHttpContextAccessor http, TimeProvider clock)
{
    public void Add(AccessAction action, AccessResult result, Guid? journalId, Guid? resourceId = null, string? detail = null)
    {
        var context = http.HttpContext;
        var user = context?.User;
        db.AccessAudits.Add(new EvidenceAccessAudit
        {
            Id = Guid.NewGuid(),
            JournalId = journalId,
            ActorUserId = Guid.TryParse(user?.FindFirstValue(AppClaimTypes.Subject), out var id) ? id : null,
            ActorName = user?.FindFirstValue(AppClaimTypes.Name) ?? user?.FindFirstValue(RobotAuthenticationHandler.RobotCodeClaim),
            Action = action,
            ResourceId = resourceId,
            OccurredAtUtc = clock.GetUtcNow(),
            IpAddress = context?.Connection.RemoteIpAddress,
            Result = result,
            RequestId = context?.TraceIdentifier,
            Detail = detail is { Length: > 500 } ? detail[..500] : detail
        });
    }
}
