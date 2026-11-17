using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using WaroTrans.Evidence.Recorder.Services;

[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace WaroTrans.Evidence.IntegrationTests.Infrastructure;

/// <summary>
/// The real Recorder against a dedicated test database (warotrans_evidence_test, never the dev one), with the WaroTrans
/// Host replaced by <see cref="FakeCore"/>.
/// </summary>
public sealed class RecorderFactory : WebApplicationFactory<Program>
{
    public const string ServiceToken = "evidence-integration-test-service-token-0123456789";
    public const string JwtKey = "warotrans-evidence-integration-test-signing-key-0123";

    public static string ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__EvidenceTest")
        ?? "Host=127.0.0.1;Port=5433;Database=warotrans_evidence_test;Username=warotrans;Password=warotrans";

    public FakeCore Core { get; } = new();

    /// <summary>The Local object store of this test run (a fresh folder).</summary>
    public static readonly string StoreRoot = Path.Combine(Path.GetTempPath(), "warotrans-evidence-it-" + Guid.NewGuid().ToString("N")[..8]);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("environment", "Development");
        builder.UseSetting("ConnectionStrings:Evidence", ConnectionString);
        builder.UseSetting("Evidence:ServiceToken", ServiceToken);
        builder.UseSetting("Evidence:CoreBaseUrl", "http://core.test");
        builder.UseSetting("Evidence:MaintenanceIntervalSeconds", "3600");
        builder.UseSetting("Authentication:Jwt:Key", JwtKey);
        builder.UseSetting("Evidence:Storage:Provider", "Local");
        builder.UseSetting("Evidence:Storage:LocalRoot", StoreRoot);
        builder.UseSetting("Evidence:Storage:LocalSigningKey", "evidence-integration-test-local-store-key-0123");
        builder.UseSetting("Evidence:Storage:LocalPublicBaseUrl", "http://localhost");
        builder.UseSetting("Evidence:Queues:Provider", "Local");
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<CoreApiClient>().ConfigurePrimaryHttpMessageHandler(() => Core));
    }

    public HttpClient ServiceClient()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add(ServiceTokenFilter.HeaderName, ServiceToken);
        return client;
    }

    public HttpClient UserClient(string role, Guid? accountId = null)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(role, accountId ?? Guid.NewGuid()));
        return client;
    }

    public static string Token(string role, Guid accountId) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "warotrans",
            Audience = "warotrans-clients",
            Expires = DateTime.UtcNow.AddMinutes(15),
            Subject = new ClaimsIdentity([new Claim("sub", accountId.ToString()), new Claim("name", role.ToLowerInvariant()), new Claim("role", role)]),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtKey)), SecurityAlgorithms.HmacSha256)
        });

    public async Task ResetAsync()
    {
        _ = Server; // starts the app: migrations run first
        Core.Reset();
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        var tables = new List<string>();
        await using (var list = new NpgsqlCommand(
                         "SELECT tablename FROM pg_tables WHERE schemaname = 'evidence' AND tablename <> '__ef_migrations_history'", connection))
        await using (var reader = await list.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                tables.Add($"evidence.\"{reader.GetString(0)}\"");
            }
        }

        if (tables.Count > 0)
        {
            await using var truncate = new NpgsqlCommand($"TRUNCATE {string.Join(", ", tables)} RESTART IDENTITY CASCADE", connection);
            await truncate.ExecuteNonQueryAsync();
        }
    }
}

/// <summary>Stands in for the WaroTrans Host: reconciliation answers and callers' capabilities.</summary>
public sealed class FakeCore : HttpMessageHandler
{
    private readonly Dictionary<string, (HttpStatusCode Status, string Body)> _routes = [];

    public void Reset() => _routes.Clear();

    public void Answer(string path, object body, HttpStatusCode status = HttpStatusCode.OK) =>
        _routes[path] = (status, JsonSerializer.Serialize(body, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri!.AbsolutePath;
        var (status, body) = _routes.TryGetValue(path, out var route) ? route : (HttpStatusCode.NotFound, "{}");
        return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
    }
}

[CollectionDefinition(Name)]
public sealed class RecorderCollection : ICollectionFixture<RecorderFactory>
{
    public const string Name = "Recorder";
}
