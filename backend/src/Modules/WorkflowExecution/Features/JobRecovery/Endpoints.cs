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
    IReadOnlyList<ActionAvailability> AvailableActions,
    bool ButtonArmed,
    Guid? ConfirmedByRobotId,
    string? Phase = null,
    string? RecoveryMode = null,
    RecoveryFaultDto? Fault = null,
    RecoveryAssessmentDto? Assessment = null,
    RecoveryLocationDto? VerifiedLocation = null,
    Guid? SourceEndpointId = null,
    bool SourceArrived = false,
    DateTimeOffset? SourceSecuredAt = null,
    Guid? SourceSecuredBy = null);

/// <summary>The failed robot when the case opened. A hint for finding it, never proof of where it stands now.</summary>
public sealed record RecoveryFaultDto(
    double? X, double? Y, double? Yaw, DateTimeOffset? SeenAt, Guid? MapVersionId, string? ErrorCode, bool? Online);

public sealed record RecoveryAssessmentDto(
    string Result, Guid? AssessedBy, DateTimeOffset? AssessedAt, IReadOnlyList<RecoveryChecklistItem> Checklist, string? Note);

public sealed record RecoveryLocationDto(double? X, double? Y, Guid? VerifiedBy, DateTimeOffset? VerifiedAt);

public sealed record RequestRecoveryRequest(string? Reason);

public sealed record AssessRecoveryRequest(Guid CaseId, int Version, string Result, IReadOnlyList<RecoveryChecklistItem>? Checklist, string? Note);

public sealed record VerifyRecoveryLocationRequest(Guid CaseId, int Version, Guid? EndpointId, double? X, double? Y);

public sealed record EvacuateRecoverySourceRequest(Guid CaseId, int Version, Guid? EndpointId);

public sealed record SecureRecoverySourceRequest(Guid CaseId, int Version, string? Note);

/// <param name="HolderType">Who holds it now: ROBOT (the failed one, or the second after the transfer), STAFF or RECOVERY_STATION.</param>
public sealed record RecoveryContainerDto(Guid ContainerId, string? Barcode, string HolderType = "ROBOT", Guid? HolderId = null);

public sealed record ResolveRecoveryManuallyRequest(
    Guid CaseId, int Version, string Disposition, IReadOnlyList<HandoverStopScan> Scans, string? ProblemCode, string? Note);

public sealed record UnloadRecoveryCargoRequest(
    Guid CaseId, int Version, IReadOnlyList<HandoverStopScan> Scans, string Holder, Guid? EndpointId, string? Note);

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
        MapTechnicalRecovery(group);
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

        group.MapPost("/jobs/{id:guid}/recovery/arm-button", async (
                Guid id, ConfirmRecoveryTransferRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse, CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                await engine.ArmRecoveryTransferAsync(id, new(request.CaseId, request.Version, Actor(currentUser)), request.RobotId,
                    request.Scans, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.JobOperate).Audited("job.recovery_button_armed", "JOB", "id")
            .WithName("ArmRecoveryTransferButton").WithTags("Jobs");

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

    /// <summary>
    /// The robot side of a recovery is a technician's: the failed robot must be in their scope (Admins see every robot).
    /// </summary>
    private static async Task EnsureFailedRobotInScopeAsync(
        Guid jobId, WorkflowExecutionDbContext db, IRobotAccessScope robotScope, CancellationToken cancellationToken)
    {
        var robotId = await db.JobRecoveryCases.AsNoTracking()
            .Where(c => c.JobId == jobId && c.ResolvedAt == null)
            .Select(c => c.FromRobotId)
            .FirstOrDefaultAsync(cancellationToken);
        var scope = await robotScope.GetCurrentAsync(cancellationToken);
        if (robotId is { } id && !scope.Allows(id))
            throw new AppException("This robot is not assigned to you.", 403, "robot_out_of_scope");
    }

    private static void MapTechnicalRecovery(RouteGroupBuilder group)
    {
        group.MapPost("/jobs/{id:guid}/recovery/request", async (
                Guid id, RequestRecoveryRequest? request, JobExecutionEngine engine, WorkflowExecutionDbContext db,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse, CancellationToken cancellationToken) =>
            {
                // Staff (job.operate) and technicians (recovery.technical.assess) may both ask for it.
                if (!currentUser.Can(Permissions.JobOperate) && !currentUser.Can(Permissions.RecoveryAssess))
                    throw new AppException("You may not ask for a payload recovery.", 403, "forbidden");
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                await engine.RequestRecoveryAsync(id, request?.Reason, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.JobRead)
            .Audited("job.recovery_requested", "JOB", "id")
            .WithName("RequestJobRecovery")
            .WithSummary("A paused Job with cargo on board needs a payload recovery (idempotent)")
            .WithTags("Jobs");

        group.MapGet("/jobs/{id:guid}/recovery/endpoint-candidates", async (
                Guid id, string? @for, JobExecutionEngine engine, ICurrentUser currentUser, StaffWarehouseScope warehouseScope,
                CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                var forSource = string.Equals(@for, "SOURCE", StringComparison.OrdinalIgnoreCase);
                return Results.Ok(new { items = await engine.ListRecoveryEndpointCandidatesAsync(id, forSource, cancellationToken) });
            })
            .RequirePermission(Permissions.JobRead)
            .WithName("ListRecoveryEndpointCandidates")
            .WithSummary("Recovery points (wait points / QUEUE) for the failed robot (for=SOURCE) or the second robot (for=TARGET)")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/unload-confirm", async (
                Guid id, UnloadRecoveryCargoRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse, CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                if (request.Note?.Length > 500)
                    throw new DomainValidationException("Keep the note to 500 characters.", "recovery_note_too_long");
                await engine.UnloadRecoveryCargoAsync(id, new(request.CaseId, request.Version, Actor(currentUser)), request.Scans ?? [],
                    request.Holder, request.EndpointId, request.Note, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.recovery_cargo_unloaded", "JOB", "id")
            .WithName("UnloadJobRecoveryCargo")
            .WithSummary("Staff scanned containers off the failed robot; a person (STAFF) or a recovery point (RECOVERY_STATION) holds them")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/resolve-manually", async (
                Guid id, ResolveRecoveryManuallyRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse, CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                if (request.Note?.Length > 500)
                    throw new DomainValidationException("Keep the note to 500 characters.", "recovery_note_too_long");
                await engine.ResolveRecoveryManuallyAsync(id, new(request.CaseId, request.Version, Actor(currentUser)), request.Disposition,
                    request.Scans ?? [], request.ProblemCode, request.Note, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.recovery_resolved_manually", "JOB", "id")
            .WithName("ResolveJobRecoveryManually")
            .WithSummary("Cargo taken off the failed robot by hand: RETURN_TO_STORAGE or QUARANTINE_CARGO (held under a CONTAINER issue)")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/assessment", async (
                Guid id, AssessRecoveryRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db, IRobotAccessScope robotScope,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse, CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                await EnsureFailedRobotInScopeAsync(id, db, robotScope, cancellationToken);
                await engine.AssessRecoveryAsync(id, new(request.CaseId, request.Version, Actor(currentUser)), request.Result,
                    request.Checklist ?? [], request.Note, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.RecoveryAssess)
            .Audited("job.recovery_assessed", "JOB", "id")
            .WithName("AssessJobRecovery")
            .WithSummary("Technical assessment of the failed robot: SELF_EVACUATION_APPROVED, MANUAL_RECOVERY_REQUIRED or SAME_ROBOT_RECOVERABLE")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/verify-location", async (
                Guid id, VerifyRecoveryLocationRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db, IRobotAccessScope robotScope,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse, CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                await EnsureFailedRobotInScopeAsync(id, db, robotScope, cancellationToken);
                await engine.VerifyRecoveryLocationAsync(id, new(request.CaseId, request.Version, Actor(currentUser)), request.EndpointId,
                    request.X, request.Y, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.RecoveryConfirmLocation)
            .Audited("job.recovery_location_verified", "JOB", "id")
            .WithName("VerifyJobRecoveryLocation")
            .WithSummary("A technician found the failed robot at this endpoint or point")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/source-evacuate", async (
                Guid id, EvacuateRecoverySourceRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db, IRobotAccessScope robotScope,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse, CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                await EnsureFailedRobotInScopeAsync(id, db, robotScope, cancellationToken);
                await engine.EvacuateRecoverySourceAsync(id, new(request.CaseId, request.Version, Actor(currentUser)), request.EndpointId,
                    cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.RecoveryApproveMotion)
            .Audited("job.recovery_source_evacuated", "JOB", "id")
            .WithName("EvacuateJobRecoverySource")
            .WithSummary("The failed robot drives itself, with its cargo, to a free recovery point (through traffic)")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/source-secure", async (
                Guid id, SecureRecoverySourceRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db, IRobotAccessScope robotScope,
                ICurrentUser currentUser, StaffWarehouseScope warehouseScope, IWarehouseModule warehouse, CancellationToken cancellationToken) =>
            {
                await warehouseScope.EnsureJobAccessAsync(id, currentUser, cancellationToken);
                await EnsureFailedRobotInScopeAsync(id, db, robotScope, cancellationToken);
                await engine.SecureRecoverySourceAsync(id, new(request.CaseId, request.Version, Actor(currentUser)), request.Note, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, warehouse, engine, currentUser, cancellationToken) });
            })
            .RequirePermission(Permissions.RecoveryConfirmClearance)
            .Audited("job.recovery_source_secured", "JOB", "id")
            .WithName("SecureJobRecoverySource")
            .WithSummary("The failed robot stands still and safe: a second robot may come for the cargo")
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
        var custody = await engine.RecoveryCustodyAsync(recovery, cancellationToken);
        var active = recovery.ResolvedAt is null
            && await db.Jobs.AsNoTracking().AnyAsync(job => job.Id == jobId && job.Status == Enums.JobStatus.RECOVERY_REQUIRED, cancellationToken);
        var own = recovery.ClaimedBy == user.AccountId;
        var ownership = !active ? "job_not_in_recovery" : own ? null : "recovery_claim_required";
        var target = recovery.Status == JobRecoveryStatuses.TargetAssigned;
        var canOperate = RolePermissionMatrix.RoleHas(user.Role, Permissions.JobOperate);
        var requestDenial = active ? await engine.RecoveryRequestDenialAsync(jobId, cancellationToken) : null;
        var confirmDenial = ownership ?? requestDenial ?? (!target ? "recovery_no_target" : !arrived ? "recovery_robot_not_arrived" : null);
        var canArm = confirmDenial is null && recovery.ToRobotId is { } targetId && await engine.CanArmRecoveryButtonAsync(targetId, cancellationToken);
        var phased = recovery.Phase is not null && engine.RecoveryRequiresSourceSecured;
        var open = active && recovery.Status == JobRecoveryStatuses.Open;
        var sourceArrived = recovery.SourceMoveStepId is { } sourceStep
            && await db.JobSteps.AsNoTracking().AnyAsync(s => s.Id == sourceStep && s.Status == Enums.JobStepStatus.COMPLETED, cancellationToken);
        var secured = recovery.SourceSecuredAt is not null;
        var assignDenial = phased && !secured ? "recovery_source_not_secured" : null;
        var sameRobotDenial = phased && recovery.AssessmentResult != RecoveryAssessmentResults.SameRobotRecoverable ? "recovery_assessment_required" : null;
        var checklist = string.IsNullOrWhiteSpace(recovery.AssessmentChecklistJson)
            ? new List<RecoveryChecklistItem>()
            : System.Text.Json.JsonSerializer.Deserialize<List<RecoveryChecklistItem>>(recovery.AssessmentChecklistJson,
                new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)) ?? [];
        return new JobRecoveryDto(
            recovery.Id, recovery.JobId, recovery.Status, recovery.Reason, recovery.FromRobotId, recovery.ToRobotId, recovery.RecoveryEndpointId,
            recovery.ContainerIds, arrived, recovery.ConfirmedBy, recovery.ConfirmedAt, recovery.Note, recovery.CreatedAt, recovery.ResolvedAt,
            recovery.ClaimedBy, recovery.Version, recovery.ContainerIds.Select(id => new RecoveryContainerDto(id, barcodes.GetValueOrDefault(id),
                custody.TryGetValue(id, out var held) ? held.Type : "ROBOT", custody.TryGetValue(id, out var h) ? h.Id : recovery.FromRobotId)).ToList(),
            [
                ActionAvailability.Of("CLAIM", !active ? "job_not_in_recovery" : recovery.ClaimedBy is null ? null : "recovery_claimed", canOperate),
                ActionAvailability.Of("RELEASE", ownership ?? (target ? "recovery_target_assigned" : null), canOperate),
                ActionAvailability.Of("ASSIGN", ownership ?? requestDenial ?? (target ? "recovery_target_assigned" : assignDenial), canOperate),
                ActionAvailability.Of("UNASSIGN", ownership ?? (!target ? "recovery_no_target"
                    : recovery.ButtonArmId is not null ? "recovery_button_armed" : null), canOperate),
                ActionAvailability.Of("CONFIRM", confirmDenial, canOperate),
                ActionAvailability.Of("ARM_BUTTON", confirmDenial ?? (canArm ? null : "recovery_button_unavailable"), canOperate),
                ActionAvailability.Of("RESUME_SAME_ROBOT", ownership ?? requestDenial ?? (target ? "recovery_target_assigned" : sameRobotDenial), canOperate),
                ActionAvailability.Of("RESOLVE_MANUALLY", ownership ?? (target ? "recovery_target_assigned" : null), canOperate),
                ActionAvailability.Of("UNLOAD", ownership ?? (assignDenial ?? (custody.Values.Any(c => c.Type == "ROBOT" && c.Id == recovery.FromRobotId)
                    ? null : "recovery_nothing_on_robot")), canOperate),
                // The robot side: a technician's, no claim needed.
                ActionAvailability.Of("ASSESS", !open ? "recovery_not_open" : null, user.Can(Permissions.RecoveryAssess)),
                ActionAvailability.Of("VERIFY_LOCATION", !active ? "job_not_in_recovery" : null, user.Can(Permissions.RecoveryConfirmLocation)),
                ActionAvailability.Of("SOURCE_EVACUATE", !open ? "recovery_not_open"
                    : recovery.RecoveryMode != RecoveryModes.SelfEvacuation ? "recovery_motion_not_approved"
                    : recovery.Phase is not (RecoveryPhases.Assessed or RecoveryPhases.InterventionRequired) ? "recovery_source_busy"
                    : null, user.Can(Permissions.RecoveryApproveMotion)),
                ActionAvailability.Of("SOURCE_SECURE", !open ? "recovery_not_open"
                    : recovery.AssessmentResult is null ? "recovery_assessment_required"
                    : secured ? "recovery_source_secured"
                    : recovery.Phase == RecoveryPhases.SourceRepositioning && !sourceArrived ? "recovery_source_not_arrived"
                    : null, user.Can(Permissions.RecoveryConfirmClearance))
            ], active && recovery.ButtonArmId is not null, recovery.ConfirmedByRobotId,
            recovery.Phase, recovery.RecoveryMode,
            new RecoveryFaultDto(recovery.LastPoseX, recovery.LastPoseY, recovery.LastPoseYaw, recovery.LastPoseAt,
                recovery.FaultMapVersionId, recovery.FaultErrorCode, recovery.FaultRobotOnline),
            recovery.AssessmentResult is null ? null
                : new RecoveryAssessmentDto(recovery.AssessmentResult, recovery.AssessedBy, recovery.AssessedAt, checklist, recovery.AssessmentNote),
            recovery.LocationVerified
                ? new RecoveryLocationDto(recovery.VerifiedX, recovery.VerifiedY, recovery.LocationVerifiedBy, recovery.LocationVerifiedAt)
                : null,
            recovery.SourceEndpointId, sourceArrived, recovery.SourceSecuredAt, recovery.SourceSecuredBy);
    }
}
