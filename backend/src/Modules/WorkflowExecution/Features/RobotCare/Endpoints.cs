using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Contracts;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.RobotCare;

public sealed record RobotCareRequest(Guid? EndpointId);

public sealed record EmergencyStopRequest(string? Reason);

public sealed record StartMaintenanceRunRequest(IReadOnlyList<Guid>? RobotIds, Guid EndpointId);

/// <param name="Force">Unplug before the battery is full (the robot is needed now).</param>
public sealed record ChargerUnpluggedRequest(bool Force = false);

/// <param name="AwaitingPlugJobNo">The robot stands at a charger and this charging Job waits for someone to plug it in.</param>
public sealed record RobotChargingView(
    Guid RobotId,
    string RobotCode,
    string Status,
    decimal? BatteryPercent,
    DateTimeOffset? ChargingSince,
    DateTimeOffset? ChargeFullAt,
    decimal FullPercent,
    string? AwaitingPlugJobNo)
{
    public RobotChargingView(RobotChargingSnapshot s, string? awaitingPlugJobNo)
        : this(s.RobotId, s.RobotCode, s.Status, s.BatteryPercent, s.ChargingSince, s.ChargeFullAt, s.FullPercent, awaitingPlugJobNo)
    {
    }
}

public static class RobotCareEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapPost("/robots/{id:guid}/emergency-stop", async (
                Guid id, EmergencyStopRequest? request, EmergencyStopService stops, ICurrentUser currentUser, CancellationToken cancellationToken) =>
                Results.Ok(await stops.StopAsync(id, request?.Reason, currentUser.AccountId ?? Guid.Empty, cancellationToken)))
            .RequirePermission(Permissions.RobotStop)
            .RequireRobotScope()
            .Audited("robot.emergency_stop", "ROBOT", "id")
            .WithName("EmergencyStopRobot")
            .WithSummary("Stop the robot now and clear its commands")
            .WithDescription("STOP (hold every motion, cancel the goal), pause every running Job of the robot, close its open commands. The robot moves again only when its Job is resumed, or the robot is resumed when it had none. Not a physical E-stop.")
            .WithTags("Robots");

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

        group.MapGet("/robots/{id:guid}/charging", async (Guid id, IFleetModule fleet, RobotCareService care, CancellationToken cancellationToken) =>
            {
                var charging = await fleet.GetChargingAsync(id, cancellationToken);
                var waiting = charging.Status == "CHARGING" ? null : await care.WaitingForPlugAsync(id, cancellationToken);
                return Results.Ok(new RobotChargingView(charging, waiting?.JobNo));
            })
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetRobotCharging")
            .WithTags("Robots");

        group.MapPost("/robots/{id:guid}/charging/plugged-in", async (
                Guid id, RobotCareService care, ICurrentUser currentUser, CancellationToken cancellationToken) =>
                Results.Ok(await care.PluggedInAsync(id, currentUser.AccountId, cancellationToken)))
            .RequirePermission(Permissions.RobotCommand)
            .RequireRobotScope()
            .WithName("ConfirmChargerPluggedIn")
            .WithSummary("A person plugged the charger in: the robot is CHARGING (its charging Job, if any, completes)")
            .WithTags("Robots");

        group.MapPost("/robots/{id:guid}/charging/unplugged", async (
                Guid id, ChargerUnpluggedRequest? request, IFleetModule fleet, CancellationToken cancellationToken) =>
                Results.Ok(await fleet.EndChargingAsync(id, request?.Force ?? false, cancellationToken)))
            .RequirePermission(Permissions.RobotCommand)
            .RequireRobotScope()
            .WithName("ConfirmChargerUnplugged")
            .WithSummary("A person unplugged the charger: the robot is AVAILABLE again")
            .WithDescription("Refused with charge_not_full below Fleet:Battery:ChargeFullPercent unless force is true.")
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
