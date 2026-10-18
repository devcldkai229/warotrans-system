using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace WaroTrans.Warehouse.Features.Shared;

internal static class UniqueViolation
{
    /// <summary>
    /// Name of the unique index a failed save ran into, or null if the failure was something else.
    /// Used when two Admins save the same value at once and both pre-checks passed.
    /// </summary>
    public static string? ConstraintOf(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } postgres
            ? postgres.ConstraintName
            : null;
}
