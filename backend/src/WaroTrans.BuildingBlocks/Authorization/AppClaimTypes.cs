namespace WaroTrans.BuildingBlocks.Authorization;

/// <summary>
/// Claim names written into the access token by Identity and read back by the Host and <c>ICurrentUser</c>.
/// </summary>
public static class AppClaimTypes
{
    public const string Subject = "sub";
    public const string Name = "name";
    public const string Role = "role";

    /// <summary>"true" while the account still has a temporary password (new account or Admin reset).</summary>
    public const string PasswordChangeRequired = "pwd_change";
}
