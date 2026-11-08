using WaroTrans.Identity.Entities;

namespace WaroTrans.Identity.Features.Shared;

internal sealed record AccountResponse(
    Guid Id,
    string Username,
    string Email,
    string FullName,
    string Role,
    string Status,
    DateTimeOffset? LastLoginAt,
    bool MustChangePassword)
{
    public static AccountResponse From(Account account) => new(
        account.Id,
        account.Username,
        account.Email,
        account.FullName,
        account.Role.ToString(),
        account.Status.ToString(),
        account.LastLoginAt,
        account.MustChangePassword);
}
