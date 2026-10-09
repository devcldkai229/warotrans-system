using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.WorkflowExecution.IntegrationEventHandlers;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution;

public static class WorkflowExecutionModule
{
    public static IServiceCollection AddWorkflowExecutionModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<WorkflowExecutionDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.AddScoped<IIntegrationEventHandler<RobotCommandLifecycleChanged>, RobotCommandLifecycleJobStepHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapWorkflowExecutionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workflow-execution");
        group.MapGet("/ping", () => Results.Ok(new { module = "workflow-execution" })).AllowAnonymous();
        return endpoints;
    }
}
