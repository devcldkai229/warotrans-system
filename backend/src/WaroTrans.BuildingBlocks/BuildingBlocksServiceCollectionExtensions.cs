using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;

namespace WaroTrans.BuildingBlocks;

public static class BuildingBlocksServiceCollectionExtensions
{
    public static IServiceCollection AddBuildingBlocks(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<PostgresOptions>(configuration.GetSection(PostgresOptions.SectionName));
        services.Configure<MongoOptions>(configuration.GetSection(MongoOptions.SectionName));
        services.Configure<MqttOptions>(configuration.GetSection(MqttOptions.SectionName));
        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));

        var postgresConnection =
            configuration.GetConnectionString("PostgreSQL")
            ?? configuration.GetSection(PostgresOptions.SectionName)["ConnectionString"]
            ?? throw new InvalidOperationException("ConnectionStrings:PostgreSQL is required.");

        services.AddDbContext<CodeSequenceDbContext>(options =>
            options.UseNpgsql(postgresConnection));

        services.AddHttpContextAccessor();
        services.TryAddSingleton(TimeProvider.System);
        services.AddScoped<ICurrentUser, CurrentUser>();
        services.AddSingleton<IIntegrationEventPublisher, InProcessIntegrationEventPublisher>();
        services.AddScoped<IBusinessCodeGenerator, BusinessCodeGenerator>();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        services.AddValidatorsFromAssembly(typeof(BuildingBlocksServiceCollectionExtensions).Assembly);
        // One MQTT client for commands (QoS1) and manual drive (QoS0).
        services.AddSingleton<MqttRobotCommandPublisher>();
        services.AddSingleton<IMqttRobotCommandPublisher>(sp => sp.GetRequiredService<MqttRobotCommandPublisher>());
        services.AddSingleton<IMqttRobotTeleopPublisher>(sp => sp.GetRequiredService<MqttRobotCommandPublisher>());
        services.AddHostedService<MqttSubscriberHostedService>();
        services.AddHostedService<MqttCommandPublisherWarmupHostedService>();

        return services;
    }
}
