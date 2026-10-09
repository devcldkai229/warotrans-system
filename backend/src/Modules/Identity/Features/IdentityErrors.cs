using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Enums;

namespace WaroTrans.Identity.Features;

internal static class IdentityErrors
{
    // Deliberately the same for "unknown username" and "wrong password" so callers cannot probe which accounts exist.
    public static readonly Error InvalidCredentials =
        Error.Unauthorized("invalid_credentials", "Invalid username or password.");

    public static readonly Error InvalidRefreshToken =
        Error.Unauthorized("invalid_refresh_token", "The session has expired. Sign in again.");

    public static readonly Error AccountNotFound =
        Error.Unauthorized("account_not_found", "The signed-in account no longer exists.");

    public static Error AccountNotActive(AccountStatus status) =>
        status == AccountStatus.LOCKED
            ? Error.Forbidden("account_locked", "This account is locked.")
            : Error.Forbidden("account_inactive", "This account is not active.");
}
