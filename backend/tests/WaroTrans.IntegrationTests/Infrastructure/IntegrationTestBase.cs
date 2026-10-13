namespace WaroTrans.IntegrationTests.Infrastructure;

[Collection(IntegrationCollection.Name)]
public abstract class IntegrationTestBase : IAsyncLifetime
{
    private HttpClient? _client;

    protected IntegrationTestBase(WaroTransWebApplicationFactory factory)
    {
        Factory = factory;
        PostgreSql = new PostgreSqlFixture();
        MongoDb = new MongoDbFixture();
    }

    protected WaroTransWebApplicationFactory Factory { get; }
    protected HttpClient Client => _client ?? throw new InvalidOperationException("Call InitializeAsync before using Client.");
    protected PostgreSqlFixture PostgreSql { get; }
    protected MongoDbFixture MongoDb { get; }

    public virtual async Task InitializeAsync()
    {
        await PostgreSql.EnsureCanConnectAsync();
        await MongoDb.EnsureCanConnectAsync();
        // Start host (and migrations) before truncating so we never race EF locks.
        _client = Factory.CreateClient();
        await DatabaseReset.TruncatePostgreSqlAsync(PostgreSql.ConnectionString);
    }

    /// <summary>
    /// A client the test authentication scheme leaves unauthenticated. Add a Bearer token to a request to go through real JWT validation.
    /// </summary>
    protected HttpClient CreateAnonymousClient()
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthenticationHandler.AnonymousHeader, "true");
        return client;
    }

    public virtual Task DisposeAsync()
    {
        _client?.Dispose();
        return Task.CompletedTask;
    }
}
