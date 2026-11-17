using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.ConfirmJobStep;
using WaroTrans.WorkflowExecution.Features.CreateWorkflow;
using WaroTrans.WorkflowExecution.Features.CreateWorkflowVersion;
using WaroTrans.WorkflowExecution.Features.DeleteWorkflow;
using WaroTrans.WorkflowExecution.Features.GetJob;
using WaroTrans.WorkflowExecution.Features.GetJobStatistics;
using WaroTrans.WorkflowExecution.Features.GetWorkflow;
using WaroTrans.WorkflowExecution.Features.GetWorkflowMetadata;
using WaroTrans.WorkflowExecution.Features.GetWorkflowRequestInputSchema;
using WaroTrans.WorkflowExecution.Features.ListJobs;
using WaroTrans.WorkflowExecution.Features.ListWorkflows;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Features.CancelJob;
using WaroTrans.WorkflowExecution.Features.ResumeJob;
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
        services.AddScoped<WaroTrans.WorkflowExecution.Seeding.StandardWorkflowSeeder>();
        services.AddScoped<DeleteWorkflowHandler>();
        services.AddScoped<GetJobStatisticsHandler>();
        services.AddScoped<Features.JobReport.JobReportReader>();

        // Work waiting on a person (an un-started job, an unconfirmed step) is noticed by a timer.
        services.Configure<StalledWorkOptions>(configuration.GetSection(StalledWorkOptions.SectionName));
        services.AddScoped<StalledWorkChecker>();
        services.AddHostedService<StalledWorkMonitorHostedService>();

        services.AddSingleton<ISystemVariableResolver, SystemVariableResolver>();
        services.AddSingleton<StepInputResolver>();
        services.AddScoped<WorkflowVariableContextBuilder>();
        services.AddScoped<IWorkflowRequestValidator, WorkflowRequestValidator>();
        services.AddScoped<IJobRuntimeProvisioner, JobRuntimeProvisioner>();
        services.AddScoped<IJobPlanLimitsQuery, JobPlanLimitsQuery>();
        services.Configure<JobPlanningOptions>(configuration.GetSection(JobPlanningOptions.SectionName));
        services.Configure<Execution.HumanTaskOptions>(configuration.GetSection(Execution.HumanTaskOptions.SectionName));
        services.AddScoped<Features.HumanTasks.HumanTaskQueries>();
        services.Configure<Execution.RecoveryOptions>(configuration.GetSection(Execution.RecoveryOptions.SectionName));
        services.AddHostedService<Services.RobotOfflineJobHostedService>();
        services.AddScoped<WaroTrans.Fleet.Contracts.IRobotWorkQuery, Services.RobotWorkQuery>();
        services.AddSingleton<IJobBatchPlanner>(sp => new CollectThenDeliverJobBatchPlanner(
            sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<JobPlanningOptions>>().Value.MaxContainersPerJob));
        services.Configure<Execution.JobQueueOptions>(configuration.GetSection(Execution.JobQueueOptions.SectionName));
        services.AddScoped<Services.JobQueueProcessor>();
        services.Configure<Features.RobotCare.FleetIdleOptions>(configuration.GetSection(Features.RobotCare.FleetIdleOptions.SectionName));
        services.AddScoped<Features.RobotCare.RobotCareService>();
        services.AddHostedService<Services.JobQueueHostedService>();

        // Job execution (GĐ 3)
        services.AddScoped<JobExecutionEngine>();
        services.AddScoped<JobQueries>();
        services.AddScoped<ITransportRequestJobControl, Services.TransportRequestJobControl>();
        services.AddScoped<StartJobHandler>();
        services.AddScoped<ResumeJobHandler>();
        services.AddScoped<CancelJobHandler>();
        services.AddScoped<WaroTrans.WorkflowExecution.Features.PauseJob.PauseJobHandler>();
        services.AddScoped<ConfirmJobStepHandler>();
        services.AddScoped<JobSummaryEnricher>();
        services.AddScoped<Features.FailJobContainer.FailJobContainerHandler>();
        services.AddScoped<Features.RobotActivity.RobotActivityQueries>();
        services.AddHostedService<HumanConfirmTimeoutHostedService>();
        services.AddHostedService<Services.WaitStepWakeupHostedService>();

        services.AddScoped<IIntegrationEventHandler<RobotCommandLifecycleChanged>, RobotCommandLifecycleJobStepHandler>();
        services.AddScoped<IIntegrationEventHandler<RobotInteractionConfirmed>, RobotInteractionConfirmedHandler>();
        services.AddScoped<IIntegrationEventHandler<RobotConnectivityChanged>, RobotConnectivityRearmHandler>();
        services.AddScoped<IIntegrationEventHandler<RobotGatewayRestarted>, RobotConnectivityRearmHandler>();

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
        group.MapDeleteWorkflow();
        group.MapListJobs();
        group.MapGetJob();
        group.MapGetJobStatistics();
        group.MapStartJob();
        WaroTrans.WorkflowExecution.Features.Dispatch.DispatchEndpoints.Map(group);
        group.MapResumeJob();
        group.MapCancelJob();
        WaroTrans.WorkflowExecution.Features.PauseJob.PauseJobEndpoint.MapPauseJob(group);
        group.MapConfirmJobStep();
        Features.FailJobContainer.FailJobContainerEndpoint.MapFailJobContainer(group);
        Features.RobotActivity.RobotActivityEndpoints.Map(group);
        Features.HumanTasks.HumanTaskEndpoints.Map(group);
        Features.JobRecovery.JobRecoveryEndpoints.Map(group);
        Features.JobQueue.JobQueueEndpoints.Map(group);
        Features.RobotCare.RobotCareEndpoints.Map(group);
        
        return endpoints;
    }
}
