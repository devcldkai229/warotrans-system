using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace WaroTrans.BuildingBlocks.Abstractions;

public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public Guid? AccountId
    {
        get
        {
            var value = User?.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User?.FindFirstValue("sub");
            return Guid.TryParse(value, out var id) ? id : null;
        }
    }

    public string? Username =>
        User?.FindFirstValue(ClaimTypes.Name)
        ?? User?.Identity?.Name;

    public bool IsAuthenticated => User?.Identity?.IsAuthenticated == true;
}
