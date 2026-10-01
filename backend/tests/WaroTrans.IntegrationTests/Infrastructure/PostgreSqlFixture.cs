using Npgsql;

namespace WaroTrans.IntegrationTests.Infrastructure;

public sealed class PostgreSqlFixture
{
    public string ConnectionString { get; } = TestConnectionStrings.PostgreSql;

    public async Task EnsureCanConnectAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand("SELECT 1", connection);
        await command.ExecuteScalarAsync(cancellationToken);
    }
}
