using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.RobotCare;

public sealed record RobotCareRequest(Guid? EndpointId);

public sealed record StartMaintenanceRunRequest(IReadOnlyList<Guid>? RobotIds, Guid EndpointId);

public static class RobotCareEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapPost("/robots/{id:guid}/return-to-park", async (
                Guid id, RobotCareRequest? request, RobotCareService care, JobQueries queries, ICurrentUser currentUser, CancellationToken cancellationToken) =>
            {
                var job = await care.ReturnToParkAsync(id, request?.EndpointId, currentUser.AccountId, cancellationToken);
                return Results.Ok(await queries.GetDetailAsync(job.Id, cancellationToken));
            })
            .RequirePermission(Permissions.RobotCommand)
            .RequireRobotScope()
            .Audited("robot.return_to_park", "ROBOT", "id")
            .WithName("ReturnRobotToPark")
            .WithSummary("Send an idle, empty robot to the given or nearest free parking place")
            .WithTags("Robots");

        group.MapPost("/robots/{id:guid}/go-to-charger", async (
                Guid id, RobotCareRequest? request, RobotCareService care, JobQueries queries, ICurrentUser currentUser, CancellationToken cancellationToken) =>
            {
                var job = await care.GoToChargerAsync(id, request?.EndpointId, currentUser.AccountId, cancellationToken);
                return Results.Ok(await queries.GetDetailAsync(job.Id, cancellationToken));
            })
            .RequirePermission(Permissions.RobotCommand)
            .RequireRobotScope()
            .Audited("robot.go_to_charger", "ROBOT", "id")
            .WithName("SendRobotToCharger")
            .WithSummary("Send a robot to a charger; a person confirms connecting it. There is no auto-dock")
            .WithTags("Robots");

        group.MapPost("/maintenance-runs", async (StartMaintenanceRunRequest request, RobotCareService care, CancellationToken cancellationToken) =>
            {
                var (runId, jobs) = await care.StartMaintenanceRunAsync(request.RobotIds ?? [], request.EndpointId, cancellationToken);
                return Results.Ok(new { runId, jobIds = jobs });
            })
            .RequirePermission(Permissions.RobotMaintenance)
            .Audited("maintenance_run.started", "MAINTENANCE_RUN", null)
            .WithName("StartMaintenanceRun")
            .WithSummary("One Job per robot, run one robot at a time")
            .WithTags("Robots");
    }
}
