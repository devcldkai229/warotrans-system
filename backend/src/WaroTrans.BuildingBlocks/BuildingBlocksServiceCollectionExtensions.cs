using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
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

        var postgresConnection =
            configuration.GetConnectionString("PostgreSQL")
            ?? configuration.GetSection(PostgresOptions.SectionName)["ConnectionString"]
            ?? throw new InvalidOperationException("ConnectionStrings:PostgreSQL is required.");

        services.AddDbContext<CodeSequenceDbContext>(options =>
            options.UseNpgsql(postgresConnection));

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();
        services.AddSingleton<IIntegrationEventPublisher, InProcessIntegrationEventPublisher>();
        services.AddScoped<IBusinessCodeGenerator, BusinessCodeGenerator>();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        services.AddValidatorsFromAssembly(typeof(BuildingBlocksServiceCollectionExtensions).Assembly);
        services.AddSingleton<IMqttRobotCommandPublisher, MqttRobotCommandPublisher>();
        services.AddHostedService<MqttSubscriberHostedService>();

        return services;
    }
}
