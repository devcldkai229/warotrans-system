using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.BuildingBlocks.Abstractions;

public interface ICurrentUser
{
    Guid? AccountId { get; }
    string? Username { get; }
    string? Role { get; }
    bool IsAuthenticated { get; }

    /// <summary>Whether the caller's role grants <paramref name="permission"/> (the same matrix the endpoints enforce).</summary>
    bool Can(string permission) => RolePermissionMatrix.RoleHas(Role, permission);
}
