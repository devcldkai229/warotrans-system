namespace WaroTrans.IntegrationTests.Infrastructure;

public static class TestConnectionStrings
{
    public static string PostgreSql =>
        Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
        ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

    public static string MongoDb =>
        Environment.GetEnvironmentVariable("ConnectionStrings__MongoDB")
        ?? Environment.GetEnvironmentVariable("Mongo__ConnectionString")
        ?? "mongodb://warotrans:warotrans@localhost:27018/?authSource=admin";

    public static string MongoDatabaseName =>
        Environment.GetEnvironmentVariable("Mongo__DatabaseName")
        ?? "warotrans_operations";
}
