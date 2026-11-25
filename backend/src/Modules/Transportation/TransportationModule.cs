using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Transportation.Features.CreateTransportRequest;
using WaroTrans.Transportation.Features.PreviewOutboundPick;
using WaroTrans.Transportation.Features.GetRequestStatistics;
using WaroTrans.Transportation.Features.GetTransportRequest;
using WaroTrans.Transportation.Features.ListTransportRequests;
using WaroTrans.Transportation.Features.QueueTransportRequest;
using WaroTrans.Transportation.Persistence;

namespace WaroTrans.Transportation;

public static class TransportationModule
{
    public static IServiceCollection AddTransportationModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<TransportationDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.AddValidatorsFromAssembly(typeof(TransportationModule).Assembly);

        services.AddScoped<CreateTransportRequestHandler>();
        // Publishing a map: requests not started yet follow it (Endpoints by code); ones it cannot carry block it.
        services.AddScoped<Features.Shared.TransportMapPublish>();
        services.AddScoped<WaroTrans.Navigation.Contracts.IMapPublishGuard>(sp => sp.GetRequiredService<Features.Shared.TransportMapPublish>());
        services.AddScoped<WaroTrans.Navigation.Contracts.IMapPublishFollower>(sp => sp.GetRequiredService<Features.Shared.TransportMapPublish>());
        services.AddScoped<OutboundPickHandler>();
        services.AddScoped<ListTransportRequestsHandler>();
        services.AddScoped<GetTransportRequestHandler>();
        services.AddScoped<QueueTransportRequestHandler>();
        services.AddScoped<GetRequestStatisticsHandler>();
        services.AddScoped<Features.RequestReport.RequestReportReader>();
        services.AddScoped<Features.CloseTransportRequest.CloseTransportRequestHandler>();

        // WH-01: handovers Warehouse still has to post, retried until they land.
        services.AddScoped<Services.StockPostingProcessor>();

        services.AddHostedService<Services.StockPostingHostedService>();

        // TRN-03: cancellations followed until every robot and container is accounted for.
        services.Configure<Features.Cancellation.TransportCancellationOptions>(
            configuration.GetSection(Features.Cancellation.TransportCancellationOptions.SectionName));
        services.AddScoped<Features.Cancellation.TransportCancellationService>();
        services.AddHostedService<Services.TransportCancellationHostedService>();

        // Job execution feedback (WorkflowExecution → Transportation)
        services.AddScoped<WaroTrans.WorkflowExecution.Contracts.ITransportRequestActivityQuery, Services.TransportRequestActivityQuery>();
        services.AddScoped<WaroTrans.WorkflowExecution.Contracts.IWorkflowUsageQuery, Services.WorkflowUsageQuery>();
        services.AddScoped<WaroTrans.WorkflowExecution.Contracts.ITransportRequestCodeLookup, Services.TransportRequestCodeLookup>();
        services.AddScoped<WaroTrans.Warehouse.Contracts.IContainerTransportLookup, Services.ContainerTransportLookup>();
        services.AddScoped<
            WaroTrans.BuildingBlocks.Abstractions.IIntegrationEventHandler<WaroTrans.WorkflowExecution.Contracts.JobContainerStatusChanged>,
            IntegrationEventHandlers.JobContainerStatusChangedHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapTransportationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/transportation");
        group.MapGet("/ping", () => Results.Ok(new { module = "transportation" })).AllowAnonymous();

        CreateTransportRequestEndpoint.Map(group);
        PreviewOutboundPickEndpoint.Map(group);
        ListTransportRequestsEndpoint.Map(group);
        GetTransportRequestEndpoint.Map(group);
        QueueTransportRequestEndpoint.Map(group);
        Features.CloseTransportRequest.CloseTransportRequestEndpoints.Map(group);
        Features.Cancellation.TransportCancellationEndpoints.Map(group);
        group.MapGetRequestStatistics();

        return endpoints;
    }
}
