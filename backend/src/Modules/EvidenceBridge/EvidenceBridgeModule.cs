using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.EvidenceBridge.Features.Capture;
using WaroTrans.EvidenceBridge.Features.Reconciliation;
using WaroTrans.EvidenceBridge.Features.Relay;
using WaroTrans.EvidenceBridge.Features.TrafficTap;
using WaroTrans.EvidenceBridge.Persistence;
using WaroTrans.EvidenceBridge.Services;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.EvidenceBridge;

/// <summary>
/// Hands what happens during transport to the separate Evidence Recorder (docs/adr/0012) through a durable outbox.
/// It only observes: it owns no business state and changes none.
/// </summary>
public static class EvidenceBridgeModule
{
    public static IServiceCollection AddEvidenceBridgeModule(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(EvidenceBridgeOptions.SectionName);
        services.Configure<EvidenceBridgeOptions>(section);
        var options = section.Get<EvidenceBridgeOptions>() ?? new EvidenceBridgeOptions();
        if (options.Enabled && options.ServiceToken.Length < EvidenceBridgeOptions.MinimumServiceTokenLength)
        {
            throw new InvalidOperationException(
                $"{EvidenceBridgeOptions.SectionName}:ServiceToken must be at least {EvidenceBridgeOptions.MinimumServiceTokenLength} characters when Evidence is enabled.");
        }

        services.AddDbContext<EvidenceBridgeDbContext>(o => o.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));
        services.AddMemoryCache();
        services.TryAddSingleton(TimeProvider.System);

        services.AddScoped<EvidenceOutboxWriter>();
        services.AddScoped<EvidenceEventCapture>();
        AddCapture<JobStatusChanged>(services);
        AddCapture<JobStepStatusChanged>(services);
        AddCapture<JobContainerStatusChanged>(services);
        AddCapture<JobRobotAssignmentChanged>(services);
        AddCapture<TransportRequestProgressed>(services);
        AddCapture<TransportRequestClosedByOperator>(services);
        AddCapture<RobotCommandLifecycleChanged>(services);
        AddCapture<RobotConnectivityChanged>(services);
        AddCapture<RobotErrorReported>(services);
        AddCapture<RobotBatteryLow>(services);
        AddCapture<RobotGatewayRestarted>(services);
        AddCapture<WaroTrans.Fleet.IntegrationEvents.LabFaultInjected>(services);
        AddCapture<WaroTrans.Fleet.IntegrationEvents.LabFaultCleared>(services);
        AddCapture<WaroTrans.WorkflowExecution.Contracts.HandoverScanRejected>(services);

        services.AddHttpClient(EvidenceOutboxRelay.HttpClientName, client =>
        {
            client.BaseAddress = new Uri(options.RecorderBaseUrl.TrimEnd('/') + "/");
            client.Timeout = TimeSpan.FromSeconds(10);
        });
        services.AddHostedService<EvidenceOutboxRelay>();
        services.AddHostedService<TrafficEvidenceTap>();
        services.AddHostedService<Features.Capture.HostStartEvidence>();
        return services;
    }

    public static IEndpointRouteBuilder MapEvidenceBridgeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/evidence-bridge").WithTags("EvidenceBridge");
        GetRequestRunsEndpoint.Map(group);
        return app;
    }

    private static void AddCapture<TEvent>(IServiceCollection services)
        where TEvent : IIntegrationEvent =>
        services.AddScoped<IIntegrationEventHandler<TEvent>>(sp => (IIntegrationEventHandler<TEvent>)(object)sp.GetRequiredService<EvidenceEventCapture>());
}
