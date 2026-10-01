using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace WaroTrans.IntegrationTests.Infrastructure;

public sealed class WaroTransWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("environment", "Development");
        builder.UseSetting("ConnectionStrings:PostgreSQL", TestConnectionStrings.PostgreSql);
        builder.UseSetting("ConnectionStrings:MongoDB", TestConnectionStrings.MongoDb);
        builder.UseSetting("Mongo:ConnectionString", TestConnectionStrings.MongoDb);
        builder.UseSetting("Mongo:DatabaseName", TestConnectionStrings.MongoDatabaseName);

        builder.ConfigureTestServices(services =>
        {
            services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = TestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = TestAuthenticationHandler.SchemeName;
                })
                .AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(
                    TestAuthenticationHandler.SchemeName,
                    _ => { });
        });
    }
}
