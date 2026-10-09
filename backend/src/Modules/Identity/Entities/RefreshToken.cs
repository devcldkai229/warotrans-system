namespace WaroTrans.Identity.Entities;

/// <summary>
/// One issued refresh token. Only the SHA-256 hash is stored, never the token itself.
/// Tokens that replace each other through rotation share a <see cref="FamilyId"/> (one signed-in device).
/// </summary>
public sealed class RefreshToken
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public Guid FamilyId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public Account Account { get; set; } = null!;
}
