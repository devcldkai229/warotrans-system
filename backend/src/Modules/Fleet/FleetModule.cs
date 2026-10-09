using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.Fleet.Features.DisableRobot;
using WaroTrans.Fleet.Features.EnableRobot;
using WaroTrans.Fleet.Features.GetRobot;
using WaroTrans.Fleet.Features.IssueCancelCommand;
using WaroTrans.Fleet.Features.IssueNavigateCommand;
using WaroTrans.Fleet.Features.ListRobots;
using WaroTrans.Fleet.Features.ProcessRobotCommandAck;
using WaroTrans.Fleet.Features.ProcessRobotCommandResult;
using WaroTrans.Fleet.Features.ProcessRobotHeartbeat;
using WaroTrans.Fleet.Features.ProcessRobotTelemetry;
using WaroTrans.Fleet.Features.RegisterRobot;
using WaroTrans.Fleet.Mqtt;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Services;

namespace WaroTrans.Fleet;

public static class FleetModule
{
    public static IServiceCollection AddFleetModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<FleetDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.AddValidatorsFromAssembly(typeof(FleetModule).Assembly);

        services.AddScoped<RegisterRobotHandler>();
        services.AddScoped<GetRobotHandler>();
        services.AddScoped<ListRobotsHandler>();
        services.AddScoped<EnableRobotHandler>();
        services.AddScoped<DisableRobotHandler>();
        services.AddScoped<ProcessRobotHeartbeatHandler>();
        services.AddScoped<ProcessRobotTelemetryHandler>();
        services.AddScoped<ProcessRobotCommandAckHandler>();
        services.AddScoped<ProcessRobotCommandResultHandler>();
        services.AddScoped<IssueNavigateCommandHandler>();
        services.AddScoped<IssueCancelCommandHandler>();
        services.AddScoped<IRobotMqttIngress, RobotMqttIngress>();
        services.AddHostedService<RobotConnectivityMonitorHostedService>();
        services.AddHostedService<RobotCommandTimeoutMonitorHostedService>();

        return services;
    }

    public static IEndpointRouteBuilder MapFleetEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/fleet");
        group.MapGet("/ping", () => Results.Ok(new { module = "fleet" }));
        group.MapRegisterRobot();
        group.MapGetRobot();
        group.MapListRobots();
        group.MapEnableRobot();
        group.MapDisableRobot();
        group.MapIssueNavigateCommand();
        group.MapIssueCancelCommand();
        return endpoints;
    }
}
