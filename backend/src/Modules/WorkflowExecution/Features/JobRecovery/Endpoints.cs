using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;

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
    DateTimeOffset? ResolvedAt);

public sealed record AssignRecoveryRobotRequest(Guid RobotId, Guid EndpointId);

public sealed record ConfirmRecoveryTransferRequest(IReadOnlyList<Guid>? ContainerIds, string? Note);

public sealed record ResumeRecoveryRequest(string? Note);

/// <summary>WFX-04: fetch the cargo of a failed robot, or go on with the same robot once it is back.</summary>
public static class JobRecoveryEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/jobs/{id:guid}/recovery", async (Guid id, WorkflowExecutionDbContext db, CancellationToken cancellationToken) =>
                Results.Ok(new { recovery = await ReadAsync(id, db, cancellationToken) }))
            .RequirePermission(Permissions.JobRead)
            .WithName("GetJobRecovery")
            .WithSummary("The latest recovery of a Job; null when it never needed one")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/assign", async (
                Guid id, AssignRecoveryRobotRequest request, JobExecutionEngine engine, WorkflowExecutionDbContext db, CancellationToken cancellationToken) =>
            {
                await engine.AssignRecoveryRobotAsync(id, request.RobotId, request.EndpointId, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, cancellationToken) });
            })
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.recovery_robot_assigned", "JOB", "id")
            .WithName("AssignJobRecoveryRobot")
            .WithSummary("Send a second robot to a safe endpoint to take the cargo")
            .WithTags("Jobs");

        group.MapPost("/jobs/{id:guid}/recovery/unassign", async (
                Guid id, JobExecutionEngine engine, WorkflowExecutionDbContext db, CancellationToken cancellationToken) =>
            {
                await engine.UnassignRecoveryRobotAsync(id, cancellationToken);
                return Results.Ok(new { recovery = await ReadAsync(id, db, cancellationToken) });
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
                CancellationToken cancellationToken) =>
            {
                var actor = Actor(currentUser);
                var recovery = await engine.ConfirmRecoveryTransferAsync(id, request.ContainerIds ?? [], actor, request.Note, cancellationToken);
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
                ResumeRecoveryRequest? request,
                JobExecutionEngine engine,
                JobQueries queries,
                ICurrentUser currentUser,
                CancellationToken cancellationToken) =>
            {
                await engine.ResumeRecoveryOnSameRobotAsync(id, Actor(currentUser), request?.Note, cancellationToken);
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

    private static async Task<JobRecoveryDto?> ReadAsync(Guid jobId, WorkflowExecutionDbContext db, CancellationToken cancellationToken)
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
        return new JobRecoveryDto(
            recovery.Id, recovery.JobId, recovery.Status, recovery.Reason, recovery.FromRobotId, recovery.ToRobotId, recovery.RecoveryEndpointId,
            recovery.ContainerIds, arrived, recovery.ConfirmedBy, recovery.ConfirmedAt, recovery.Note, recovery.CreatedAt, recovery.ResolvedAt);
    }
}
