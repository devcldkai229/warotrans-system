using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.Fleet.Features.RobotControl;

public sealed record StopRobotRequest(string? Mode = null, string? Reason = null);

public sealed record AcquireLeaseRequest(bool Takeover = false, string? Reason = null, bool Sequenced = false, Guid? LeaseId = null);

public sealed record StartMaintenanceRequest(string Reason);

public sealed record SystemActionRequest(string Action, string? ConfirmRobotCode = null);

/// <summary>Where the robot stands: an endpoint of its map, or a pose (a suggestion of AUTO_LOCALIZE).</summary>
public sealed record LocalizeRobotRequest(Guid? EndpointId = null, double? X = null, double? Y = null, double? Yaw = null);

public sealed record AutoLocalizeRobotRequest(bool AllowSpin = false);

/// <summary>Robot control endpoints: stop / resume (RB-03), manual lease (RB-04), maintenance (RB-08), power (RB-09).</summary>
public static class RobotControlEndpoints
{
    public static RouteGroupBuilder MapRobotControl(this RouteGroupBuilder group)
    {
        group.MapPost("/robots/{id:guid}/commands/stop", async (Guid id, StopRobotRequest? request, RobotControlService control, CancellationToken ct) =>
                Results.Accepted(
                    $"/api/fleet/robots/{id}/stop-state",
                    await control.StopAsync(id, request?.Mode == StopCommandPayload.ModePause ? StopCommandPayload.ModePause : StopCommandPayload.ModeStop, request?.Reason, ct)))
            .RequirePermission(Permissions.RobotStop)
            .RequireRobotScope()
            .Audited("robot.stop_requested", "ROBOT", "id")
            .WithName("StopRobot")
            .WithDescription("The robot cancels its goal and holds every motion until RESUME. Follow the answer with GET stop-state: REQUESTED → ACCEPTED → STOPPED_VERIFIED, or REJECTED / UNKNOWN. Not an E-stop.");

        group.MapPost("/robots/{id:guid}/commands/resume", async (Guid id, RobotControlService control, CancellationToken ct) =>
                Results.Accepted($"/api/fleet/robots/{id}/stop-state", await control.ResumeAsync(id, ct)))
            .RequirePermission(Permissions.RobotConfigure)
            .RequireRobotScope()
            .Audited("robot.resume_requested", "ROBOT", "id")
            .WithName("ResumeRobot");

        group.MapGet("/robots/{id:guid}/stop-state", async (Guid id, RobotControlService control, CancellationToken ct) =>
                Results.Ok(await control.GetStopStateAsync(id, ct)))
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetRobotStopState");

        group.MapGet("/robots/{id:guid}/manual/lease", async (Guid id, RobotControlService control, CancellationToken ct) =>
                Results.Ok(await control.GetLeaseAsync(id, ct)))
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetManualLease");

        group.MapPost("/robots/{id:guid}/manual/lease", async (Guid id, AcquireLeaseRequest? request, RobotControlService control, CancellationToken ct) =>
                Results.Ok(await control.AcquireLeaseAsync(id, request ?? new(), ct)))
            .RequirePermission(Permissions.RobotManualDrive)
            .RequireRobotScope()
            .WithName("AcquireManualLease")
            .WithDescription("Grants or renews (30 s) the exclusive right to drive this robot by hand. Renew every ~10 s while driving. 409 manual_lease_held when someone else holds it; an Admin may take over with a reason.");

        group.MapDelete("/robots/{id:guid}/manual/lease", async (Guid id, Guid? leaseId, RobotControlService control, CancellationToken ct) =>
            {
                await control.ReleaseLeaseAsync(id, ct, leaseId);
                return Results.NoContent();
            })
            .RequirePermission(Permissions.RobotManualDrive)
            .RequireRobotScope()
            .WithName("ReleaseManualLease");

        group.MapGet("/robots/{id:guid}/maintenance", async (Guid id, RobotControlService control, CancellationToken ct) =>
                Results.Ok(await control.MaintenanceHistoryAsync(id, ct)))
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("ListRobotMaintenance");

        group.MapPost("/robots/{id:guid}/maintenance/start", async (Guid id, StartMaintenanceRequest request, RobotControlService control, CancellationToken ct) =>
                Results.Ok(await control.StartMaintenanceAsync(id, request.Reason, ct)))
            .RequirePermission(Permissions.RobotMaintenance)
            .RequireRobotScope()
            .WithName("StartRobotMaintenance");

        group.MapPost("/robots/{id:guid}/maintenance/complete", async (Guid id, MaintenanceChecklist request, RobotControlService control, CancellationToken ct) =>
                Results.Ok(await control.CompleteMaintenanceAsync(id, request, ct)))
            .RequirePermission(Permissions.RobotMaintenance)
            .RequireRobotScope()
            .WithName("CompleteRobotMaintenance")
            .WithDescription("Returns the robot to service only when sensorsOk, localizationOk, stopTestOk and trafficClear are all true.");

        group.MapPost("/robots/{id:guid}/commands/localize", async (Guid id, LocalizeRobotRequest request, RobotControlService control, CancellationToken ct) =>
                Results.Accepted(null, new
                {
                    commandId = request.EndpointId is { } endpointId
                        ? await control.LocalizeAsync(id, endpointId, ct)
                        : request is { X: { } x, Y: { } y }
                            ? await control.LocalizeAtPoseAsync(id, x, y, request.Yaw ?? 0, ct)
                            : throw new WaroTrans.BuildingBlocks.Exceptions.DomainValidationException(
                                "Give an endpoint or a pose.", "localize_target_required")
                }))
            .RequirePermission(Permissions.RobotLocalize)
            .RequireRobotScope()
            .Audited("robot.localize_requested", "ROBOT", "id")
            .WithName("LocalizeRobot")
            .WithDescription("The robot sets its pose estimate to the given endpoint of its map (where an operator placed it), or to a pose (x, y, yaw) such as a suggestion of auto-localize. Refused while it runs a command. Follow localizationStatus on the robot.");

        group.MapPost("/robots/{id:guid}/commands/auto-localize", async (Guid id, AutoLocalizeRobotRequest? request, RobotControlService control, CancellationToken ct) =>
                Results.Accepted(
                    $"/api/fleet/robots/{id}/auto-localize",
                    new { commandId = await control.AutoLocalizeAsync(id, request?.AllowSpin ?? false, AutoLocalizeTriggers.Operator, ct) }))
            .RequirePermission(Permissions.RobotLocalize)
            .RequireRobotScope()
            .Audited("robot.auto_localize_requested", "ROBOT", "id")
            .WithName("AutoLocalizeRobot")
            .WithDescription("The robot finds where it stands: scan matching against its last pose, home and every endpoint of its map; a turn on the spot only with allowSpin. It takes a pose only when sure, otherwise it answers with suggestions. Follow GET auto-localize.");

        group.MapGet("/robots/{id:guid}/auto-localize", async (Guid id, RobotControlService control, CancellationToken ct) =>
                Results.Ok(await control.GetAutoLocalizeAsync(id, ct)))
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetRobotAutoLocalize");

        group.MapPost("/robots/{id:guid}/system-actions", async (Guid id, SystemActionRequest request, RobotControlService control, CancellationToken ct) =>
                Results.Accepted(null, new { commandId = await control.SystemActionAsync(id, request.Action, request.ConfirmRobotCode, ct) }))
            .RequirePermission(Permissions.RobotPower)
            .RequireRobotScope()
            .Audited("robot.system_action", "ROBOT", "id")
            .WithName("RobotSystemAction")
            .WithDescription("RESTART_NAV / RESTART_LOCALIZATION / RESTART_CAMERA / RESTART_STACK / REBOOT / SHUTDOWN, only those the robot announced. The robot must be stopped (held) and idle; for RESTART_STACK, REBOOT and SHUTDOWN confirmRobotCode must repeat the robot code. There is no remote power-on.");

        return group;
    }
}
