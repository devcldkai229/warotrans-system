using WaroTrans.Identity.Enums;

namespace WaroTrans.Identity.Entities;

public sealed class Account
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public AccountRole Role { get; set; }
    public AccountStatus Status { get; set; }

    /// <summary>
    /// True while the account holds a temporary password handed out by an Admin (new account or reset).
    /// The token then only opens "who am I", change password and sign out.
    /// </summary>
    public bool MustChangePassword { get; set; }

    public DateTimeOffset? PasswordChangedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}




