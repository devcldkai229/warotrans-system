using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Transportation.Features.CreateTransportRequest;
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
        services.AddScoped<ListTransportRequestsHandler>();
        services.AddScoped<GetTransportRequestHandler>();
        services.AddScoped<QueueTransportRequestHandler>();
        services.AddScoped<GetRequestStatisticsHandler>();

        // Job execution feedback (WorkflowExecution → Transportation)
        services.AddScoped<WaroTrans.WorkflowExecution.Contracts.ITransportRequestActivityQuery, Services.TransportRequestActivityQuery>();
        services.AddScoped<WaroTrans.WorkflowExecution.Contracts.IWorkflowUsageQuery, Services.WorkflowUsageQuery>();
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
        ListTransportRequestsEndpoint.Map(group);
        GetTransportRequestEndpoint.Map(group);
        QueueTransportRequestEndpoint.Map(group);
        group.MapGetRequestStatistics();

        return endpoints;
    }
}
