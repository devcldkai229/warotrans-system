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
        builder.UseSetting("Mqtt:Host", "localhost");
        builder.UseSetting("Mqtt:Port", "1883");
        builder.UseSetting("Mqtt:ClientId", $"warotrans-test-{Guid.NewGuid():N}");
        builder.UseSetting("Mqtt:TopicPrefix", "warotrans/v1");
        builder.UseSetting("Mqtt:HeartbeatTimeoutSeconds", "2");
        builder.UseSetting("Mqtt:CommandAckTimeoutSeconds", "60");

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

            // Avoid real outbound MQTT connect stalls during IssueNavigate; inbound ack/result still use broker.
            services.AddSingleton<WaroTrans.BuildingBlocks.Mqtt.IMqttRobotCommandPublisher, CapturingMqttRobotCommandPublisher>();
        });
    }
}

