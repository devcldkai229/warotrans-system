using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.ConfirmJobStep;
using WaroTrans.WorkflowExecution.Features.CreateWorkflow;
using WaroTrans.WorkflowExecution.Features.CreateWorkflowVersion;
using WaroTrans.WorkflowExecution.Features.GetJob;
using WaroTrans.WorkflowExecution.Features.GetWorkflow;
using WaroTrans.WorkflowExecution.Features.GetWorkflowMetadata;
using WaroTrans.WorkflowExecution.Features.GetWorkflowRequestInputSchema;
using WaroTrans.WorkflowExecution.Features.ListJobs;
using WaroTrans.WorkflowExecution.Features.ListWorkflows;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Features.StartJob;
using WaroTrans.WorkflowExecution.Features.PublishWorkflow;
using WaroTrans.WorkflowExecution.Features.UpdateWorkflow;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.IntegrationEventHandlers;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Planning;
using WaroTrans.WorkflowExecution.Runtime;
using WaroTrans.WorkflowExecution.Services;

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
        services.AddScoped<GetWorkflowRequestInputSchemaHandler>();
        services.AddScoped<CreateWorkflowHandler>();
        services.AddScoped<UpdateWorkflowHandler>();
        services.AddScoped<PublishWorkflowHandler>();
        services.AddScoped<CreateWorkflowVersionHandler>();

        services.AddSingleton<ISystemVariableResolver, SystemVariableResolver>();
        services.AddSingleton<StepInputResolver>();
        services.AddScoped<WorkflowVariableContextBuilder>();
        services.AddScoped<IWorkflowRequestValidator, WorkflowRequestValidator>();
        services.AddScoped<IJobRuntimeProvisioner, JobRuntimeProvisioner>();
        services.AddSingleton<IJobBatchPlanner, CollectThenDeliverJobBatchPlanner>();

        // Job execution (GĐ 3)
        services.AddScoped<JobExecutionEngine>();
        services.AddScoped<JobQueries>();
        services.AddScoped<StartJobHandler>();
        services.AddScoped<ConfirmJobStepHandler>();

        services.AddScoped<IIntegrationEventHandler<RobotCommandLifecycleChanged>, RobotCommandLifecycleJobStepHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapWorkflowExecutionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workflow-execution");

        // Giữ lại dòng ping duy nhất có cấu hình bảo mật AllowAnonymous của develop
        group.MapGet("/ping", () => Results.Ok(new { module = "workflow-execution" })).AllowAnonymous();
        
        // Giữ lại toàn bộ các API tính năng mới của nhánh feature
        group.MapGetWorkflowMetadata();
        group.MapListWorkflows();
        group.MapGetWorkflow();
        group.MapGetWorkflowRequestInputSchema();
        group.MapCreateWorkflow();
        group.MapUpdateWorkflow();
        group.MapPublishWorkflow();
        group.MapCreateWorkflowVersion();
        group.MapListJobs();
        group.MapGetJob();
        group.MapStartJob();
        group.MapConfirmJobStep();
        
        return endpoints;
    }
}
