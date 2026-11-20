using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.WorkflowExecution.Features.HandoverStops;

public enum HandoverStopAction { Claim, Begin, Release }

public sealed class HandoverStopsHandler(
    WorkflowExecutionDbContext db,
    StaffWarehouseScope staffWarehouse,
    ICurrentUser user,
    IAccountNameLookup accountNames,
    IWarehouseModule warehouse,
    TimeProvider clock,
    IOptions<HumanTaskOptions> options)
{
    private HumanTaskOptions Settings => options.Value;

    public async Task<IReadOnlyList<HandoverStopResponse>> ListAsync(bool mine, CancellationToken cancellationToken)
    {
        var actor = Actor();
        var jobs = await JobsWithSteps().AsNoTracking().Where(job => job.Status == JobStatus.RUNNING).ToListAsync(cancellationToken);
        var visibleMaps = await staffWarehouse.VisibleMapIdsAsync(jobs.Select(job => job.MapVersionId), user, cancellationToken);
        jobs.RemoveAll(job => !visibleMaps.Contains(job.MapVersionId));
        var operations = await LoadHumanOperationsAsync(jobs.Select(job => job.WorkflowId).Distinct().ToArray(), cancellationToken);
        var now = clock.GetUtcNow();
        var stops = jobs.Select(job => StopHandover.Read(job, operations)).OfType<StopHandover>()
            .Where(stop => stop.OfferOpensAt(Settings) <= now && (!mine || stop.OwnerAt(now, Settings) == actor))
            .OrderBy(stop => stop.OfferOpensAt(Settings)).ToList();
        return await ProjectAsync(stops, actor, now, cancellationToken);
    }

    public async Task<HandoverStopResponse> ChangeAsync(
        Guid jobId, Guid stopId, HandoverStopVersionRequest request, HandoverStopAction action,
        CancellationToken cancellationToken)
    {
        var actor = Actor();
        await staffWarehouse.EnsureJobAccessAsync(jobId, user, cancellationToken);
        await using var transaction = db.Database.IsNpgsql()
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        if (transaction is not null)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT id FROM execution.jobs WHERE id = {jobId} FOR UPDATE", cancellationToken);
        var job = await JobsWithSteps().FirstOrDefaultAsync(job => job.Id == jobId, cancellationToken)
            ?? throw new NotFoundException($"Job '{jobId}' was not found.", "job_not_found");
        var operations = await LoadHumanOperationsAsync([job.WorkflowId], cancellationToken);
        var now = clock.GetUtcNow();
        var stop = StopHandover.Read(job, operations);
        if (stop is null || stop.StopTask.Id != stopId || stop.MoveId != request.MoveId
            || stop.StopTask.HandoverVersion != request.Version)
            throw new ConflictException("The handover stop changed. Refresh the queue.", "handover_stop_changed");
        if (now < stop.OfferOpensAt(Settings))
            throw new ConflictException("This handover is not open for claim yet.", "handover_stop_not_open");

        var task = stop.StopTask;
        var owner = stop.OwnerAt(now, Settings);
        switch (action)
        {
            case HandoverStopAction.Claim:
                if (owner is not null && owner != actor)
                    throw new ConflictException("Another operator holds this handover.", "handover_stop_claimed");
                if (stop.Containers.Any(item => item.Step.ClaimedBy is { } holder && holder != actor && item.Step.ClaimExpiresAt > now))
                    throw new ConflictException("A step at this stop is already held by another operator.", "human_task_claimed");
                if (owner == actor) break;
                task.HandoverClaimedBy = actor;
                task.HandoverClaimMoveId = stop.MoveId;
                task.HandoverClaimedAt = now;
                task.HandoverBeganAt = null;
                task.HandoverVersion++;
                break;
            case HandoverStopAction.Begin:
                EnsureOwner(owner, actor);
                if (stop.ReadyAt is not { } readyAt || readyAt > now)
                    throw new ConflictException("Wait until the robot reaches the handover stop.", "handover_robot_not_ready");
                if (task.HandoverBeganAt is not null) break;
                task.HandoverBeganAt = now;
                task.HandoverVersion++;
                break;
            case HandoverStopAction.Release:
                EnsureOwner(owner, actor);
                if (task.HandoverBeganAt is not null)
                    throw new ConflictException("This handover has started and cannot be released.", "handover_already_began");
                task.HandoverClaimedBy = null;
                task.HandoverClaimMoveId = null;
                task.HandoverClaimedAt = null;
                task.HandoverVersion++;
                break;
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("The handover stop changed. Refresh the queue.", "handover_stop_changed");
        }
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        return (await ProjectAsync([stop], actor, now, cancellationToken))[0];
    }

    private Guid Actor() => user.AccountId
        ?? throw new AppException("Sign in to operate a handover.", 401, "unauthenticated");

    private static void EnsureOwner(Guid? owner, Guid actor)
    {
        if (owner != actor)
            throw new ConflictException("Claim this handover before operating it.", "handover_stop_claim_required");
    }

    private IQueryable<Job> JobsWithSteps() => db.Jobs.Include(job => job.JobTasks).ThenInclude(task => task.JobSteps).AsSplitQuery();

    private async Task<Dictionary<Guid, string>> LoadHumanOperationsAsync(Guid[] workflowIds, CancellationToken cancellationToken)
    {
        if (workflowIds.Length == 0) return [];
        var steps = await db.WorkflowSteps.AsNoTracking()
            .Where(step => workflowIds.Contains(step.WorkflowTask.WorkflowId) && step.StepType == StepType.HUMAN_INTERACTION)
            .Select(step => new { step.Id, step.Config }).ToListAsync(cancellationToken);
        return steps.ToDictionary(step => step.Id, step => step.Config.OperationCode);
    }

    private async Task<IReadOnlyList<HandoverStopResponse>> ProjectAsync(
        IReadOnlyList<StopHandover> stops, Guid actor, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (stops.Count == 0) return [];
        var ids = stops.SelectMany(stop => stop.Containers.Select(item => item.ContainerId)).Distinct().ToArray();
        var barcodes = (await warehouse.GetContainersAsync(ids, cancellationToken)).ToDictionary(item => item.Id, item => item.Barcode);
        var owners = stops.Select(stop => stop.OwnerAt(now, Settings)).OfType<Guid>().Distinct().ToArray();
        var names = await accountNames.GetNamesAsync(owners, cancellationToken);
        return stops.Select(stop =>
        {
            var owner = stop.OwnerAt(now, Settings);
            return new HandoverStopResponse(
                stop.StopTask.Id, stop.Job.Id, stop.Job.JobNo, stop.Job.MapVersionId, stop.EndpointId, stop.MoveId, stop.Action,
                stop.Containers.Select(item => new HandoverStopContainerResponse(item.ContainerId, barcodes.GetValueOrDefault(item.ContainerId))).ToList(),
                stop.OfferOpensAt(Settings), stop.ReadyAt, owner, owner is { } holder ? names.GetValueOrDefault(holder) : null,
                owner is null ? null : stop.BeginDeadline(Settings), stop.StopTask.HandoverBeganAt, stop.StopTask.HandoverVersion,
                [
                    ActionAvailability.Of("CLAIM", owner is null ? null : "handover_stop_claimed", permitted: true),
                    ActionAvailability.Of("BEGIN", owner != actor ? "handover_stop_claim_required"
                        : stop.ReadyAt is not { } readyAt || readyAt > now ? "handover_robot_not_ready"
                        : stop.StopTask.HandoverBeganAt is null ? null : "handover_already_began", permitted: true),
                    ActionAvailability.Of("RELEASE", owner != actor ? "handover_stop_claim_required"
                        : stop.StopTask.HandoverBeganAt is null ? null : "handover_already_began", permitted: true)
                ]);
        }).ToList();
    }
}
