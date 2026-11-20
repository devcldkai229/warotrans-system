using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.WorkflowExecution.Features.JobRecovery;

public sealed record JobRecoveryDto(
    Guid Id,
    Guid JobId,
    string Status,
    string Reason,
    Guid? FromRobotId,
    Guid? ToRobotId,
    Guid? RecoveryEndpointId,
    IReadOnlyList<Guid> ContainerIds,
    bool RobotArrived,
    Guid? ConfirmedBy,
    DateTimeOffset? ConfirmedAt,
    string? Note,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ResolvedAt,
    Guid? ClaimedBy,
    int Version,
    IReadOnlyList<RecoveryContainerDto> Containers,
    IReadOnlyList<ActionAvailability> AvailableActions);

public sealed record RecoveryContainerDto(Guid ContainerId, string? Barcode);

public sealed record RecoveryVersionRequest(Guid CaseId, int Version);

public sealed record AssignRecoveryRobotRequest(Guid CaseId, int Version, Guid RobotId, Guid EndpointId);

public sealed record ConfirmRecoveryTransferRequest(
    Guid CaseId, int Version, Guid RobotId, IReadOnlyList<HandoverStopScan>? Scans, string? Note);

public sealed record ResumeRecoveryRequest(Guid CaseId, int Version, string? Note);

/// <summary>WFX-04: fetch the cargo of a failed robot, or go on with the same robot once it is back.</summary>
public static class JobRecoveryEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/jobs/{id:guid}/recovery", async (
                Guid id, WorkflowExecutionDbContext db, ICurrentUser currentUser, StaffWarehouseScope warehouseScope,
                IWarehouseModule warehouse, JobExecutionEngine engine, CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.JobRead)
            .WithName("GetJobRecovery")
            .WithSummary("The latest recovery of a Job; null when it never needed one")
            .WithTags("Jobs");

        group.MapGet("/jobs/{id:guid}/recovery/candidates", async (
                Guid id, JobExecutionEngine engine, ICurrentUser currentUser, StaffWarehouseScope warehouseScope,
                CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                return Results.Ok(new { items = await engine.ListRecoveryCandidatesAsync(id, cancellationToken) });
            })
            .RequirePermission(Permissions.JobOperate).WithName("ListRecoveryRobotCandidates").WithTags("Jobs");

        MapClaim("claim", release: false);
        MapClaim("release", release: true);

        void MapClaim(string path, bool release)
        {
            group.MapPost($"/jobs/{{id:guid}}/recovery/{path}", async (
                    Guid id, RecoveryVersionRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db,
                    ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse,
                    CancellationToken cancellationToken) =>
                {
                    await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                    await engine.SetRecoveryClaimAsync(id, new(request.CaseId, request.Version, Actor(currentUser)), release, cancellationToken);
                    return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
                })
                .RequirePermission(Permissions.JobOperate).Audited($"job.recovery_{path}", "JOB", "id")
                .WithName(release ? "ReleaseJobRecovery" : "ClaimJobRecovery").WithTags("Jobs");
        }

        group.MapPost("/jobs/{id:guid}/recovery/assign", async (
                Guid id, AssignRecoveryRobotRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse,
                CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                await engine.AssignRecoveryRobotAsync(id, request.RobotId, request.EndpointId, cancellationToken,
                    new(request.CaseId, request.Version, Actor(currentUser)));
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.recovery_robot_assigned", "JOB", "id")
            .WithName("AssignJobRecoveryRobot")
            .WithSummary("Send a second robot to a safe endpoint to take the cargo")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/unassign", async (
                Guid id, RecoveryVersionRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse,
                CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                await engine.UnassignRecoveryRobotAsync(id, cancellationToken, new(request.CaseId, request.Version, Actor(currentUser)));
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.recovery_robot_unassigned", "JOB", "id")
            .WithName("UnassignJobRecoveryRobot")
            .WithSummary("Call back the robot that was on its way")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/transfer-confirm", async (
                Guid id,
                ConfirmRecoveryTransferRequest request,
                JobExecutionEngine engine,
                JobQueries queries,
                IAuditTrail audit,
                ICurrentUser currentUser,
                StaffWarehouseScope warehouseScope,
                CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                var actor = Actor(currentUser);
                if (request.Note?.Length > 500)
                    throw new DomainValidationException("Keep the transfer note to 500 characters.", "recovery_note_too_long");
                var recovery = await engine.ConfirmRecoveryTransferAsync(id, [], actor, request.Note, cancellationToken,
                    new(request.CaseId, request.Version, actor), request.RobotId, request.Scans);
                await audit.RecordAsync(
                    new AuditEntry(
                        "job.payload_transferred",
                        "JOB",
                        id,
                        Before: new Dictionary<string, object?> { ["robotId"] = recovery.FromRobotId },
                        After: new Dictionary<string, object?> { ["robotId"] = recovery.ToRobotId, ["containerIds"] = recovery.ContainerIds },
                        Reason: recovery.Note),
                    cancellationToken);
                return Results.Ok(await queries.GetDetailAsync(id, cancellationToken));
            })
            .RequirePermission(Permissions.JobOperate)
            .WithName("ConfirmJobRecoveryTransfer")
            .WithSummary("A person saw the cargo move to the second robot; the Job now belongs to it")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/resume-same-robot", async (
                Guid id,
                ResumeRecoveryRequest request,
                JobExecutionEngine engine,
                JobQueries queries,
                ICurrentUser currentUser,
                StaffWarehouseScope warehouseScope,
                CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                var actor = Actor(currentUser);
                if (request.Note?.Length > 500)
                    throw new DomainValidationException("Keep the recovery note to 500 characters.", "recovery_note_too_long");
                await engine.ResumeRecoveryOnSameRobotAsync(id, actor, request.Note, cancellationToken, new(request.CaseId, request.Version, actor));
                return Results.Ok(await queries.GetDetailAsync(id, cancellationToken));
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.recovery_resumed_same_robot", "JOB", "id")
            .WithName("ResumeJobRecoveryOnSameRobot")
            .WithSummary("The failed robot is back and still has the cargo: continue with it")
            .WithTags("Jobs");
    }

    private static Guid Actor(ICurrentUser currentUser) =>
        currentUser.AccountId ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");

    private static async Task<JobRecoveryDto?> ReadAsync(
        Guid jobId, WorkflowExecutionDbContext db, IWarehouseModule warehouse, JobExecutionEngine engine,
        ICurrentUser user, CancellationToken cancellationToken)
    {
        var recovery = await db.JobRecoveryCases.AsNoTracking()
            .Where(c => c.JobId == jobId)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (recovery is null)
        {
            return null;
        }

        var arrived = recovery.MoveStepId is { } stepId
            && await db.JobSteps.AsNoTracking().AnyAsync(s => s.Id == stepId && s.Status == Enums.JobStepStatus.COMPLETED, cancellationToken);
        var barcodes = (await warehouse.GetContainersAsync(recovery.ContainerIds, cancellationToken)).ToDictionary(item => item.Id, item => item.Barcode);
        var active = recovery.ResolvedAt is null
            && await db.Jobs.AsNoTracking().AnyAsync(job => job.Id == jobId && job.Status == Enums.JobStatus.RECOVERY_REQUIRED, cancellationToken);
        var own = recovery.ClaimedBy == user.AccountId;
        var ownership = !active ? "job_not_in_recovery" : own ? null : "recovery_claim_required";
        var target = recovery.Status == JobRecoveryStatuses.TargetAssigned;
        var canOperate = RolePermissionMatrix.RoleHas(user.Role, Permissions.JobOperate);
        var requestDenial = active ? await engine.RecoveryRequestDenialAsync(jobId, cancellationToken) : null;
        return new JobRecoveryDto(
            recovery.Id, recovery.JobId, recovery.Status, recovery.Reason, recovery.FromRobotId, recovery.ToRobotId, recovery.RecoveryEndpointId,
            recovery.ContainerIds, arrived, recovery.ConfirmedBy, recovery.ConfirmedAt, recovery.Note, recovery.CreatedAt, recovery.ResolvedAt,
            recovery.ClaimedBy, recovery.Version, recovery.ContainerIds.Select(id => new RecoveryContainerDto(id, barcodes.GetValueOrDefault(id))).ToList(),
            [
                ActionAvailability.Of("CLAIM", !active ? "job_not_in_recovery" : recovery.ClaimedBy is null ? null : "recovery_claimed", canOperate),
                ActionAvailability.Of("RELEASE", ownership ?? (target ? "recovery_target_assigned" : null), canOperate),
                ActionAvailability.Of("ASSIGN", ownership ?? requestDenial ?? (target ? "recovery_target_assigned" : null), canOperate),
                ActionAvailability.Of("UNASSIGN", ownership ?? (target ? null : "recovery_no_target"), canOperate),
                ActionAvailability.Of("CONFIRM", ownership ?? requestDenial ?? (!target ? "recovery_no_target"
                    : !arrived ? "recovery_robot_not_arrived" : null), canOperate),
                ActionAvailability.Of("RESUME_SAME_ROBOT", ownership ?? requestDenial ?? (target ? "recovery_target_assigned" : null), canOperate)
            ]);
    }
}
