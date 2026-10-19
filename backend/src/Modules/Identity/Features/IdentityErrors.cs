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

    // Account management (Admin). Codes differ from AccountNotFound above, which is the 401 of "/me".
    public static readonly Error TargetAccountNotFound =
        Error.NotFound("target_account_not_found", "The account does not exist.");

    public static readonly Error UsernameTaken =
        Error.Conflict("username_taken", "This username is already in use.");

    public static readonly Error EmailTaken =
        Error.Conflict("email_taken", "This email is already in use.");

    public static readonly Error CannotChangeOwnAccess =
        Error.Forbidden("cannot_change_own_access", "You cannot change your own role or deactivate your own account.");

    public static readonly Error LastActiveAdmin =
        Error.Conflict("last_active_admin", "At least one active administrator must remain.");

    public static Error AccountNotActive(AccountStatus status) =>
        status == AccountStatus.LOCKED
            ? Error.Forbidden("account_locked", "This account is locked.")
            : Error.Forbidden("account_inactive", "This account is not active.");
}
