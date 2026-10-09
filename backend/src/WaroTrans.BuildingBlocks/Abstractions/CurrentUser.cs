using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.BuildingBlocks.Abstractions;

public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public Guid? AccountId
    {
        get
        {
            var value = User?.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User?.FindFirstValue(AppClaimTypes.Subject);
            return Guid.TryParse(value, out var id) ? id : null;
        }
    }

    public string? Username =>
        User?.FindFirstValue(ClaimTypes.Name)
        ?? User?.Identity?.Name;

    // The role claim name depends on the authentication scheme, so ask the identity which one it uses.
    public string? Role =>
        User?.Identity is ClaimsIdentity identity
            ? identity.FindFirst(identity.RoleClaimType)?.Value
            : null;

    public bool IsAuthenticated => User?.Identity?.IsAuthenticated == true;
}
