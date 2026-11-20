using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.WorkflowExecution.Features.HandoverStops;

public enum HandoverStopAction { Claim, Begin, Release, Heartbeat, Extend }

public sealed class HandoverStopsHandler(
    WorkflowExecutionDbContext db,
    StaffWarehouseScope staffWarehouse,
    ICurrentUser user,
    IAccountNameLookup accountNames,
    IWarehouseModule warehouse,
    TimeProvider clock,
    IOptions<HumanTaskOptions> options,
    JobExecutionEngine engine,
    JobQueries queries,
    IIssueReporter issues,
    IStaffWorkZones workZones,
    INavigationModule navigation,
    IIntegrationEventPublisher events)
{
    private HumanTaskOptions Settings => options.Value;

    public async Task<IReadOnlyList<HandoverStopResponse>> ListAsync(bool mine, CancellationToken cancellationToken)
    {
        var actor = Actor();
        var jobs = await JobsWithSteps().AsNoTracking().Where(job => job.Status == JobStatus.RUNNING).ToListAsync(cancellationToken);
        var visibleMaps = await staffWarehouse.VisibleMapIdsAsync(jobs.Select(job => job.MapVersionId), user, cancellationToken);
        jobs.RemoveAll(job => !visibleMaps.Contains(job.MapVersionId));
        var operations = await StopHandover.LoadOperationsAsync(db, jobs.Select(job => job.WorkflowId).Distinct().ToArray(), cancellationToken);
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
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var job = await JobsWithSteps().FirstOrDefaultAsync(job => job.Id == jobId, cancellationToken)
            ?? throw new NotFoundException($"Job '{jobId}' was not found.", "job_not_found");
        var operations = await StopHandover.LoadOperationsAsync(db, [job.WorkflowId], cancellationToken);
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
                if (owner is null && await WorkZonePriorityAsync(stop, await GetWorkZoneAsync(cancellationToken), now, cancellationToken) is { Denied: true })
                    throw new ConflictException("This handover is temporarily reserved for Staff in its work zone.", "handover_work_zone_priority");
                if (owner is not null && owner != actor)
                    throw new ConflictException("Another operator holds this handover.", "handover_stop_claimed");
                if (stop.Containers.Any(item => item.Step.ClaimedBy is { } holder && holder != actor && item.Step.ClaimExpiresAt > now))
                    throw new ConflictException("A step at this stop is already held by another operator.", "human_task_claimed");
                if (owner == actor) break;
                task.HandoverClaimedBy = actor;
                task.HandoverClaimMoveId = stop.MoveId;
                task.HandoverClaimedAt = now;
                task.HandoverHeartbeatAt = now;
                task.HandoverBeganAt = null;
                task.HandoverWorkDeadline = null;
                task.HandoverVersion++;
                break;
            case HandoverStopAction.Begin:
                EnsureOwner(owner, actor);
                if (stop.ReadyAt is not { } readyAt || readyAt > now)
                    throw new ConflictException("Wait until the robot reaches the handover stop.", "handover_robot_not_ready");
                if (task.HandoverBeganAt is not null) break;
                task.HandoverBeganAt = now;
                task.HandoverWorkDeadline = now.AddSeconds(Math.Max(Settings.StopWorkWindowSeconds, 1));
                task.HandoverVersion++;
                break;
            case HandoverStopAction.Release:
                EnsureOwner(owner, actor);
                if (task.HandoverBeganAt is not null)
                    throw new ConflictException("This handover has started and cannot be released.", "handover_already_began");
                task.HandoverClaimedBy = null;
                task.HandoverClaimMoveId = null;
                task.HandoverClaimedAt = null;
                task.HandoverHeartbeatAt = null;
                task.HandoverVersion++;
                break;
            case HandoverStopAction.Heartbeat:
                EnsureOwner(owner, actor);
                if (task.HandoverBeganAt is null) task.HandoverHeartbeatAt = now;
                break;
            case HandoverStopAction.Extend:
                EnsureOwner(owner, actor);
                if (task.HandoverBeganAt is null)
                    throw new ConflictException("Begin the handover before extending it.", "handover_stop_begin_required");
                var deadline = task.HandoverWorkDeadline > now ? task.HandoverWorkDeadline.Value : now;
                task.HandoverWorkDeadline = deadline.AddSeconds(Math.Max(Settings.StopWorkExtensionSeconds, 1));
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
        if (task.HandoverVersion != request.Version
            && await navigation.GetMapVersionAsync(job.MapVersionId, CancellationToken.None) is { } map)
            await events.PublishAsync(new HandoverStopQueueChanged(job.Id, task.Id, map.WarehouseId), CancellationToken.None);

        return (await ProjectAsync([stop], actor, now, cancellationToken))[0];
    }

    public async Task<JobDetailDto> ConfirmAsync(
        Guid jobId, Guid stopId, ConfirmHandoverStopRequest request, CancellationToken cancellationToken)
    {
        var actor = Actor();
        await staffWarehouse.EnsureJobAccessAsync(jobId, user, cancellationToken);
        await engine.ConfirmHandoverStopAsync(jobId, stopId, request.MoveId, request.Version, request.Scans, actor, cancellationToken);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }

    public Task<StaffWorkZone?> GetWorkZoneAsync(CancellationToken cancellationToken) =>
        user.Role == AppRoles.Staff ? workZones.GetAsync(Actor(), cancellationToken) : Task.FromResult<StaffWorkZone?>(null);

    public async Task<StaffWorkZone?> SetWorkZoneAsync(Guid? zoneId, CancellationToken cancellationToken)
    {
        StaffWorkZone? selection = null;
        if (zoneId is { } id)
        {
            var zone = await navigation.GetWorkZoneAsync(id, cancellationToken);
            var map = zone is null ? null : await navigation.GetMapVersionAsync(zone.MapVersionId, cancellationToken);
            if (map is not { Status: MapStatus.PUBLISHED } || map.WarehouseId != await staffWarehouse.GetOperatingWarehouseIdAsync(cancellationToken))
                throw new DomainValidationException("Choose a work zone from the current warehouse map.", "handover_work_zone_invalid");
            selection = new StaffWorkZone(map.WarehouseId, zone!.Code.ToUpperInvariant());
        }

        await workZones.SetAsync(Actor(), selection, cancellationToken);
        return selection;
    }

    private async Task<(DateTimeOffset OpensAt, bool Denied)> WorkZonePriorityAsync(
        StopHandover stop, StaffWorkZone? selected, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var codes = await navigation.GetWorkZoneCodesAtEndpointAsync(stop.EndpointId, cancellationToken);
        var opens = stop.WarehouseOpensAt(Settings, codes.Count != 0);
        if (user.Role != AppRoles.Staff || now >= opens)
            return (opens, false);

        var map = await navigation.GetMapVersionAsync(stop.Job.MapVersionId, cancellationToken);
        return (opens, selected is null || selected.WarehouseId != map?.WarehouseId || !codes.Contains(selected.Code));
    }

    private Guid Actor() => user.AccountId
        ?? throw new AppException("Sign in to operate a handover.", 401, "unauthenticated");

    private static void EnsureOwner(Guid? owner, Guid actor)
    {
        if (owner != actor)
            throw new ConflictException("Claim this handover before operating it.", "handover_stop_claim_required");
    }

    private IQueryable<Job> JobsWithSteps() => db.Jobs.Include(job => job.JobTasks).ThenInclude(task => task.JobSteps).AsSplitQuery();

    private async Task<IReadOnlyList<HandoverStopResponse>> ProjectAsync(
        IReadOnlyList<StopHandover> stops, Guid actor, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (stops.Count == 0) return [];
        var ids = stops.SelectMany(stop => stop.Containers.Select(item => item.ContainerId)).Distinct().ToArray();
        var barcodes = (await warehouse.GetContainersAsync(ids, cancellationToken)).ToDictionary(item => item.Id, item => item.Barcode);
        var owners = stops.Select(stop => stop.OwnerAt(now, Settings)).OfType<Guid>().Distinct().ToArray();
        var names = await accountNames.GetNamesAsync(owners, cancellationToken);
        var workZone = await GetWorkZoneAsync(cancellationToken);
        var result = new List<HandoverStopResponse>(stops.Count);
        foreach (var stop in stops)
        {
            var owner = stop.OwnerAt(now, Settings);
            var (warehouseOpens, priorityDenial) = await WorkZonePriorityAsync(stop, workZone, now, cancellationToken);
            var confirmDenial = owner != actor ? "handover_stop_claim_required"
                : stop.ReadyAt is not { } arrived || arrived > now ? "handover_robot_not_ready"
                : stop.StopTask.HandoverBeganAt is null ? "handover_stop_begin_required" : null;
            if (confirmDenial is null && await issues.HasBlockingHandoverIssueAsync(stop.Job.Id,
                    stop.Containers.Select(item => item.ContainerId).ToArray(), cancellationToken))
                confirmDenial = "handover_issue_blocking";

            result.Add(new HandoverStopResponse(
                stop.StopTask.Id, stop.Job.Id, stop.Job.JobNo, stop.Job.MapVersionId, stop.EndpointId, stop.MoveId, stop.Action,
                stop.Containers.Select(item => new HandoverStopContainerResponse(item.ContainerId, barcodes.GetValueOrDefault(item.ContainerId))).ToList(),
                stop.OfferOpensAt(Settings), stop.ReadyAt, owner, owner is { } holder ? names.GetValueOrDefault(holder) : null,
                owner is null ? null : stop.BeginDeadline(Settings), stop.StopTask.HandoverBeganAt, stop.StopTask.HandoverVersion,
                [
                    ActionAvailability.Of("CLAIM", owner is not null ? "handover_stop_claimed"
                        : priorityDenial ? "handover_work_zone_priority" : null, permitted: true),
                    ActionAvailability.Of("BEGIN", owner != actor ? "handover_stop_claim_required"
                        : stop.ReadyAt is not { } readyAt || readyAt > now ? "handover_robot_not_ready"
                        : stop.StopTask.HandoverBeganAt is null ? null : "handover_already_began", permitted: true),
                    ActionAvailability.Of("RELEASE", owner != actor ? "handover_stop_claim_required"
                        : stop.StopTask.HandoverBeganAt is null ? null : "handover_already_began", permitted: true),
                    ActionAvailability.Of("EXTEND", owner != actor ? "handover_stop_claim_required"
                        : stop.StopTask.HandoverBeganAt is null ? "handover_stop_begin_required" : null, permitted: true),
                    ActionAvailability.Of("CONFIRM", confirmDenial, permitted: true)
                ], warehouseOpens, stop.StopTask.HandoverWorkDeadline, Math.Max(Settings.StopDisconnectSeconds / 3, 1)));
        }
        return result;
    }
}
