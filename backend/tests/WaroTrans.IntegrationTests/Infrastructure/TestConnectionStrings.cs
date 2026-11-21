using System.Globalization;

namespace WaroTrans.IntegrationTests.Infrastructure;

/// <summary>
/// Integration tests TRUNCATE every module schema (DatabaseReset). Defaults therefore point at dedicated *_test
/// databases on the dev server, never at the dev databases themselves (warotrans / warotrans_operations).
/// </summary>
public static class TestConnectionStrings
{
    public static string PostgreSql =>
        Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
        ?? "Host=localhost;Port=5433;Database=warotrans_test;Username=warotrans;Password=warotrans";

    public static string MongoDb =>
        Environment.GetEnvironmentVariable("ConnectionStrings__MongoDB")
        ?? Environment.GetEnvironmentVariable("Mongo__ConnectionString")
        ?? "mongodb://warotrans:warotrans@localhost:27018/?authSource=admin";

    public static string MongoDatabaseName =>
        Environment.GetEnvironmentVariable("Mongo__DatabaseName")
        ?? "warotrans_operations_test";

    public static string MqttHost => Environment.GetEnvironmentVariable("Mqtt__Host") ?? "localhost";

    public static int MqttPort => int.Parse(Environment.GetEnvironmentVariable("Mqtt__Port") ?? "1883", CultureInfo.InvariantCulture);
}
