using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Features.DisableRobot;
using WaroTrans.Fleet.Features.EnableRobot;
using WaroTrans.Fleet.Features.GetRobot;
using WaroTrans.Fleet.Features.GetRobotStatistics;
using WaroTrans.Fleet.Features.IssueCancelCommand;
using WaroTrans.Fleet.Features.IssueNavigateCommand;
using WaroTrans.Fleet.Features.ListRobots;
using WaroTrans.Fleet.Features.ProcessRobotCommandAck;
using WaroTrans.Fleet.Features.ProcessRobotCommandResult;
using WaroTrans.Fleet.Features.ProcessRobotHeartbeat;
using WaroTrans.Fleet.Features.ProcessRobotInteractionConfirm;
using WaroTrans.Fleet.Features.ProcessRobotTelemetry;
using WaroTrans.Fleet.Features.GetTrafficSnapshot;
using WaroTrans.Fleet.Features.ReconcileTrafficRobot;
using WaroTrans.Fleet.Features.RegisterRobot;
using WaroTrans.Fleet.Features.TeleopRobot;
using WaroTrans.Fleet.Mqtt;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Services;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet;

public static class FleetModule
{
    public static IServiceCollection AddFleetModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<FleetDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.Configure<TrafficOptions>(configuration.GetSection(TrafficOptions.SectionName));
        services.Configure<TrafficFootprintOptions>(configuration.GetSection(TrafficFootprintOptions.SectionName));

        services.AddValidatorsFromAssembly(typeof(FleetModule).Assembly);

        services.AddScoped<RegisterRobotHandler>();
        services.AddScoped<GetRobotHandler>();
        services.AddScoped<ListRobotsHandler>();
        services.AddScoped<GetRobotStatisticsHandler>();
        services.AddScoped<EnableRobotHandler>();
        services.AddScoped<DisableRobotHandler>();
        services.AddScoped<ProcessRobotHeartbeatHandler>();
        services.AddScoped<ProcessRobotTelemetryHandler>();
        services.AddScoped<ProcessRobotCommandAckHandler>();
        services.AddScoped<ProcessRobotCommandResultHandler>();
        services.AddScoped<ProcessRobotInteractionConfirmHandler>();
        services.AddScoped<IssueNavigateCommandHandler>();
        services.AddScoped<IFleetModule, WaroTrans.Fleet.Services.FleetModuleApi>();
        services.AddScoped<IssueCancelCommandHandler>();
        services.AddScoped<TeleopRobotHandler>();
        services.AddScoped<IRobotMqttIngress, RobotMqttIngress>();

        services.AddSingleton<TrafficReadySignal>();
        services.AddSingleton<ShadowSingleMoverGuard>();
        services.AddSingleton<TrafficEventOutbox>();
        services.AddSingleton<ITrafficOpsLog, TrafficOpsLog>();
        services.AddSingleton<ITrafficCoordinator>(sp =>
            new TrafficCoordinator(sp.GetRequiredService<TrafficReadySignal>()));
        services.AddSingleton<RoutePlanner>();
        services.AddSingleton<SegmentedTrafficCoordinator>();
        services.AddSingleton<ISegmentedTrafficCoordinator>(sp => sp.GetRequiredService<SegmentedTrafficCoordinator>());
        services.AddSingleton<TrafficShadowObserver>();
        services.AddScoped<TrafficProgressIngress>();
        services.AddHostedService(sp => sp.GetRequiredService<SegmentedTrafficCoordinator>());
        services.AddHostedService<TrafficReconciliationHostedService>();
        services.AddHostedService<TrafficAuthorityPublisher>();
        services.AddHostedService<TrafficAuthorityRenewHostedService>();
        services.AddHostedService<RobotConnectivityMonitorHostedService>();
        services.AddHostedService<RobotCommandTimeoutMonitorHostedService>();
        services.AddHostedService<TrafficGrantHostedService>();

        return services;
    }

    public static IEndpointRouteBuilder MapFleetEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/fleet");
        group.MapGet("/ping", () => Results.Ok(new { module = "fleet" })).AllowAnonymous();
        group.MapRegisterRobot();
        group.MapGetRobot();
        group.MapListRobots();
        group.MapGetRobotStatistics();
        group.MapEnableRobot();
        group.MapDisableRobot();
        group.MapIssueNavigateCommand();
        group.MapIssueCancelCommand();
        group.MapTeleopRobot();
        group.MapGetTrafficSnapshot();
        group.MapTrafficOperatorEndpoints();
        return endpoints;
    }
}
