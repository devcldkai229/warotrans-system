using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Execution;

public sealed record RecoveryCaseAccess(Guid CaseId, int Version, Guid Actor);

public sealed record RecoveryRobotCandidate(Guid RobotId, string RobotCode, int MaxContainers, bool Eligible, IReadOnlyList<string> Reasons);

public sealed partial class JobExecutionEngine
{
    public async Task SetRecoveryClaimAsync(Guid jobId, RecoveryCaseAccess access, bool release, CancellationToken cancellationToken)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var (_, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        EnsureRecoveryVersion(recovery, access);
        if (recovery.ClaimedBy is { } actor && actor != access.Actor)
            throw new ConflictException("Another operator holds this recovery.", "recovery_claimed");
        if (release && recovery.Status != JobRecoveryStatuses.Open)
            throw new ConflictException("Call back the recovery robot before releasing this case.", "recovery_target_assigned");
        var claimedBy = release ? (Guid?)null : access.Actor;
        if (recovery.ClaimedBy == claimedBy) return;
        recovery.ClaimedBy = claimedBy;
        recovery.Version++;
        await SaveAndPublishAsync(cancellationToken, transaction);
    }

    public async Task<IReadOnlyList<RecoveryRobotCandidate>> ListRecoveryCandidatesAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var (job, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        var candidates = await EvaluateRecoveryDispatchAsync(job, await RobotsBusyWithOtherJobsAsync(jobId, cancellationToken), cancellationToken);
        var count = job.JobContainers.Count(item => item.Status == JobContainerStatus.ONBOARD);
        var result = new List<RecoveryRobotCandidate>();
        foreach (var candidate in candidates.Where(candidate => candidate.RobotId != recovery.FromRobotId))
        {
            var robot = await fleet.GetRobotAsync(candidate.RobotId, cancellationToken);
            if (robot is null) continue;
            var capacity = RobotLoad.EffectiveMaxContainers(robot.MaxContainers);
            var reasons = candidate.Reasons.ToList();
            if (capacity < count && !reasons.Contains(DispatchReasons.ContainerLimitExceeded))
                reasons.Add(DispatchReasons.ContainerLimitExceeded);
            if (robot.LastTelemetryAt is not { } telemetry || (clock ?? TimeProvider.System).GetUtcNow() - telemetry > ResumeTelemetryMaxAge)
                reasons.Add("robot_telemetry_stale");
            result.Add(new RecoveryRobotCandidate(robot.Id, robot.Code, capacity, reasons.Count == 0, reasons));
        }
        return result;
    }

    private async Task EnsureRecoveryRobotReadyAsync(
        Job job, RobotSnapshot robot, IReadOnlySet<Guid> busy, bool strict, CancellationToken cancellationToken)
    {
        var count = job.JobContainers.Count(item => item.Status == JobContainerStatus.ONBOARD);
        if (count > RobotLoad.EffectiveMaxContainers(robot.MaxContainers))
            throw new ConflictException("This robot cannot take all containers of this recovery.", DispatchReasons.ContainerLimitExceeded);

        var candidate = (await EvaluateRecoveryDispatchAsync(job, busy, cancellationToken)).FirstOrDefault(item => item.RobotId == robot.Id);
        EnsureCapacityAllows(candidate, robot);
        if (strict && candidate is not { Eligible: true })
            throw new ConflictException("The recovery robot is not ready to take this load.", candidate?.Reasons.FirstOrDefault() ?? "robot_not_available");
    }

    private Task<JobRecoveryCase?> FindConfirmedRecoveryAsync(
        Guid jobId, RecoveryCaseAccess access, Guid? expectedRobotId, CancellationToken cancellationToken) =>
        db.JobRecoveryCases.AsNoTracking().SingleOrDefaultAsync(item =>
            item.Id == access.CaseId && item.JobId == jobId && item.Status == JobRecoveryStatuses.Transferred
            && item.Version - 1 == access.Version && item.ConfirmedBy == access.Actor && item.ToRobotId == expectedRobotId,
            cancellationToken);

    private async Task VerifyRecoveryTransferAsync(
        Job job, JobRecoveryCase recovery, Guid target, Guid? expectedRobotId, IReadOnlySet<Guid> onBoard,
        IReadOnlyList<HandoverStopScan>? scans, CancellationToken cancellationToken)
    {
        if (expectedRobotId != target)
            throw new ConflictException("The selected recovery robot has changed.", "recovery_target_changed");
        await EnsureRecoveryRequestsActiveAsync(job, cancellationToken);
        await EnsureNoBlockingHandoverIssuesAsync(job.Id, onBoard, cancellationToken);
        await VerifyContainerScansAsync(onBoard, scans, cancellationToken);

        var robot = await fleet.GetRobotAsync(target, cancellationToken)
            ?? throw new ConflictException("The recovery robot is no longer available.", "robot_not_available");
        var busy = await RobotsBusyWithOtherJobsAsync(job.Id, cancellationToken);
        EnsureRobotCanTakeJob(robot, job, busy);
        EnsureRobotLocalized(robot, (clock ?? TimeProvider.System).GetUtcNow());
        await EnsureRecoveryRobotReadyAsync(job, robot, busy, strict: true, cancellationToken);
        var endpoint = recovery.RecoveryEndpointId is { } endpointId
            ? await navigation.GetEndpointPoseAsync(endpointId, cancellationToken)
            : null;
        if (endpoint is not { IsEnabled: true } || endpoint.MapVersionId != job.MapVersionId
            || Math.Sqrt(Math.Pow(robot.PoseX - endpoint.X, 2) + Math.Pow(robot.PoseY - endpoint.Y, 2)) > endpoint.PositionTolerance)
            throw new ConflictException("The recovery robot is no longer at the transfer point.", "recovery_robot_not_arrived");
    }

    private async Task<IReadOnlyList<DispatchCandidate>> EvaluateRecoveryDispatchAsync(
        Job job, IReadOnlySet<Guid> busy, CancellationToken cancellationToken)
    {
        var ids = job.JobContainers.Where(item => item.Status == JobContainerStatus.ONBOARD).Select(item => item.ContainerId).ToArray();
        var cargo = warehouse is null ? [] : await warehouse.GetContainersAsync(ids, cancellationToken);
        var weight = cargo.Count == ids.Length && cargo.All(item => item.WeightKg is not null) ? cargo.Sum(item => item.WeightKg) : null;
        var map = await navigation.GetMapVersionAsync(job.MapVersionId, cancellationToken);
        return await fleet.EvaluateDispatchAsync(new DispatchQuery(job.MapVersionId, null, null, busy)
        {
            ContainerCount = ids.Length,
            TotalWeightKg = weight,
            MapVersionCode = map?.Code
        }, cancellationToken);
    }

    private static void EnsureRecoveryVersion(JobRecoveryCase recovery, RecoveryCaseAccess access)
    {
        if (recovery.Id != access.CaseId || recovery.Version != access.Version)
            throw new ConflictException("This recovery case changed. Refresh it and try again.", "recovery_case_changed");
    }

    private static void EnsureRecoveryOwner(JobRecoveryCase recovery, RecoveryCaseAccess? access)
    {
        if (access is not null) EnsureRecoveryVersion(recovery, access);
        if (recovery.ClaimedBy != access?.Actor || (access is not null && recovery.ClaimedBy is null))
            throw new ConflictException("Claim this recovery before operating it.", "recovery_claim_required");
    }

    internal async Task<string?> RecoveryRequestDenialAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        return await RecoveryRequestDenialAsync(job, cancellationToken);
    }

    private async Task EnsureRecoveryRequestsActiveAsync(Job job, CancellationToken cancellationToken)
    {
        if (await RecoveryRequestDenialAsync(job, cancellationToken) is { } reason)
            throw new ConflictException("The transport request has stopped. Review the cargo before resuming.", reason);
    }

    private async Task<string?> RecoveryRequestDenialAsync(Job job, CancellationToken cancellationToken)
    {
        if (job.FailureCode == CargoOnboardCancelCode)
            return "recovery_request_inactive";

        var ids = job.JobContainers.Where(item => item.Status is JobContainerStatus.ONBOARD or JobContainerStatus.ASSIGNED)
            .Select(item => item.TransportRequestId).Distinct();
        foreach (var id in ids)
        {
            var status = await requestActivity.GetStatusAsync(id, cancellationToken);
            if (status == "CANCELLING" || !ITransportRequestActivityQuery.IsActive(status))
                return "recovery_request_inactive";
        }
        return null;
    }
}
