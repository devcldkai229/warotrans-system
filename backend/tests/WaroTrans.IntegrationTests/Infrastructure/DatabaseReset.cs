using Npgsql;

namespace WaroTrans.IntegrationTests.Infrastructure;

public static class DatabaseReset
{
    private static readonly string[] Schemas =
    [
        "identity",
        "warehouse",
        "transportation",
        "execution",
        "fleet",
        "navigation"
    ];

    public static async Task TruncatePostgreSqlAsync(
        string connectionString,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        await using (var begin = new NpgsqlCommand("BEGIN", connection))
        {
            await begin.ExecuteNonQueryAsync(cancellationToken);
        }

        try
        {
            await using (var lockTimeout = new NpgsqlCommand("SET LOCAL lock_timeout = '5s'", connection))
            {
                await lockTimeout.ExecuteNonQueryAsync(cancellationToken);
            }

            var tables = new List<string>();
            await using (var listCmd = new NpgsqlCommand(
                             """
                             SELECT schemaname, tablename
                             FROM pg_tables
                             WHERE schemaname = ANY(@schemas)
                             ORDER BY schemaname, tablename
                             """,
                             connection))
            {
                listCmd.Parameters.AddWithValue("schemas", Schemas);
                await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    var schema = reader.GetString(0);
                    var table = reader.GetString(1);
                    tables.Add($"\"{schema}\".\"{table}\"");
                }
            }

            if (tables.Count > 0)
            {
                var sql = $"TRUNCATE {string.Join(", ", tables)} RESTART IDENTITY CASCADE";
                await using var truncate = new NpgsqlCommand(sql, connection);
                await truncate.ExecuteNonQueryAsync(cancellationToken);
            }

            await using var commit = new NpgsqlCommand("COMMIT", connection);
            await commit.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.DeadlockDetected)
        {
            await using var rollback = new NpgsqlCommand("ROLLBACK", connection);
            await rollback.ExecuteNonQueryAsync(cancellationToken);
            // One retry after a brief pause.
            await Task.Delay(200, cancellationToken);
            await TruncatePostgreSqlOnceAsync(connectionString, cancellationToken);
        }
        catch
        {
            await using var rollback = new NpgsqlCommand("ROLLBACK", connection);
            await rollback.ExecuteNonQueryAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task TruncatePostgreSqlOnceAsync(
        string connectionString,
        CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        await using var begin = new NpgsqlCommand("BEGIN", connection);
        await begin.ExecuteNonQueryAsync(cancellationToken);

        await using var lockTimeout = new NpgsqlCommand("SET LOCAL lock_timeout = '5s'", connection);
        await lockTimeout.ExecuteNonQueryAsync(cancellationToken);

        var tables = new List<string>();
        await using (var listCmd = new NpgsqlCommand(
                         """
                         SELECT schemaname, tablename
                         FROM pg_tables
                         WHERE schemaname = ANY(@schemas)
                         ORDER BY schemaname, tablename
                         """,
                         connection))
        {
            listCmd.Parameters.AddWithValue("schemas", Schemas);
            await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                tables.Add($"\"{reader.GetString(0)}\".\"{reader.GetString(1)}\"");
            }
        }

        if (tables.Count > 0)
        {
            await using var truncate = new NpgsqlCommand(
                $"TRUNCATE {string.Join(", ", tables)} RESTART IDENTITY CASCADE",
                connection);
            await truncate.ExecuteNonQueryAsync(cancellationToken);
        }

        await using var commit = new NpgsqlCommand("COMMIT", connection);
        await commit.ExecuteNonQueryAsync(cancellationToken);
    }
}
