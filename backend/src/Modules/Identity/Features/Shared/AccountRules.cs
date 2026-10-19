using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.Identity.Enums;

namespace WaroTrans.Identity.Features.Shared;

internal static class AccountRules
{
    /// <summary>
    /// Usernames are lower case because sign-in compares them exactly: storing "Alice" for someone who types
    /// "alice" (or the other way round) would lock them out.
    /// </summary>
    public const string UsernamePattern = "^[a-z0-9._-]+$";

    public static bool TryParseRole(string? value, out AccountRole role) =>
        Enum.TryParse(value, ignoreCase: false, out role) && Enum.IsDefined(role);

    public static bool TryParseStatus(string? value, out AccountStatus status) =>
        Enum.TryParse(value, ignoreCase: false, out status) && Enum.IsDefined(status);

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    /// <summary>Name of the unique index a failed save ran into, or null if the failure was something else.</summary>
    public static string? UniqueViolationConstraint(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } postgres
            ? postgres.ConstraintName
            : null;
}
