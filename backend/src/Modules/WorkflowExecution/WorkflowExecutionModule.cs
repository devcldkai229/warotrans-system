using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.WorkflowExecution.Features.CreateWorkflow;
using WaroTrans.WorkflowExecution.Features.CreateWorkflowVersion;
using WaroTrans.WorkflowExecution.Features.GetWorkflow;
using WaroTrans.WorkflowExecution.Features.GetWorkflowMetadata;
using WaroTrans.WorkflowExecution.Features.ListWorkflows;
using WaroTrans.WorkflowExecution.Features.PublishWorkflow;
using WaroTrans.WorkflowExecution.Features.UpdateWorkflow;
using WaroTrans.WorkflowExecution.IntegrationEventHandlers;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Runtime;

namespace WaroTrans.WorkflowExecution;

public static class WorkflowExecutionModule
{
    public static IServiceCollection AddWorkflowExecutionModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<WorkflowExecutionDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.AddValidatorsFromAssembly(typeof(WorkflowExecutionModule).Assembly);

        services.AddScoped<ListWorkflowsHandler>();
        services.AddScoped<GetWorkflowHandler>();
        services.AddScoped<CreateWorkflowHandler>();
        services.AddScoped<UpdateWorkflowHandler>();
        services.AddScoped<PublishWorkflowHandler>();
        services.AddScoped<CreateWorkflowVersionHandler>();

        services.AddSingleton<ISystemVariableResolver, SystemVariableResolver>();
        services.AddSingleton<StepInputResolver>();
        services.AddScoped<WorkflowVariableContextBuilder>();

        services.AddScoped<IIntegrationEventHandler<RobotCommandLifecycleChanged>, RobotCommandLifecycleJobStepHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapWorkflowExecutionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workflow-execution");
        group.MapGet("/ping", () => Results.Ok(new { module = "workflow-execution" }));
        group.MapGetWorkflowMetadata();
        group.MapListWorkflows();
        group.MapGetWorkflow();
        group.MapCreateWorkflow();
        group.MapUpdateWorkflow();
        group.MapPublishWorkflow();
        group.MapCreateWorkflowVersion();
        return endpoints;
    }
}
