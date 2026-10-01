using MongoDB.Bson;
using MongoDB.Driver;

namespace WaroTrans.IntegrationTests.Infrastructure;

public sealed class MongoDbFixture
{
    public string ConnectionString { get; } = TestConnectionStrings.MongoDb;
    public string DatabaseName { get; } = TestConnectionStrings.MongoDatabaseName;

    public IMongoDatabase GetDatabase()
    {
        var client = new MongoClient(ConnectionString);
        return client.GetDatabase(DatabaseName);
    }

    public async Task EnsureCanConnectAsync(CancellationToken cancellationToken = default)
    {
        var database = GetDatabase();
        await database.RunCommandAsync<BsonDocument>(
            new BsonDocument("ping", 1),
            cancellationToken: cancellationToken);
    }
}
