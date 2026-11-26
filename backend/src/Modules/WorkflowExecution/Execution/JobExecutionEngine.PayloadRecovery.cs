using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>One item of a technical recovery checklist (motor, localization, safety sensors, STOP, payload, battery …).</summary>
public sealed record RecoveryChecklistItem(string Item, bool Ok, string? Note = null);

/// <summary>What staff do with cargo taken off a failed robot by hand.</summary>
public static class RecoveryDispositions
{
    public const string ReturnToStorage = "RETURN_TO_STORAGE";
    public const string QuarantineCargo = "QUARANTINE_CARGO";
}

/// <summary>A place a robot may be sent to in a recovery, ranked: free first, then by path length from the cargo.</summary>
/// <param name="PathMeters">Length of the way on the map (A* over the costmap); null when no map bundle is configured.</param>
/// <param name="Unsuitable">Why it cannot be chosen now (taken, the failed robot stands there …); null when it can.</param>
public sealed record RecoveryEndpointCandidate(
    Guid EndpointId, string Code, string Name, string EndpointType, double DistanceMeters, double? PathMeters, string? Unsuitable);

/// <summary>
/// Payload recovery (WAROTRANS_PAYLOAD_RECOVERY_DESIGN.md): before a second robot comes for the cargo, a technician
/// assesses the failed robot, confirms where it really stands, lets it drive itself out of the way (a free parking place)
/// when it is safe to, and confirms it stands secured. The recovery point is the queue point (QUEUE, EP-QUEUE*, EP-WAIT*,
/// EP-RECOVERY*; one on the lab map): the second robot takes the cargo there. The case keeps the
/// failed robot's last pose and error from the moment it opened. Every motion goes through traffic like any MOVE.
/// </summary>
public sealed partial class JobExecutionEngine
{
    /// <summary>A task added for a recovery MOVE (the failed robot to its recovery point, or the second robot to the cargo).</summary>
    private static bool IsRecoveryTask(JobTask task) =>
        task.ContextValues.TryGetValue("executionScope", out var scope)
        && scope.ValueKind == JsonValueKind.String && scope.GetString() == "RECOVERY";

    /// <summary>False = the earlier flow: a second robot may be sent before any assessment (Recovery:RequireSourceSecured).</summary>
    public bool RecoveryRequiresSourceSecured => recoveryOptions?.Value.RequireSourceSecured ?? true;

    /// <summary>The failed robot when the case opens: a hint for finding it, never proof of where it stands now.</summary>
    private async Task RecordFaultSnapshotAsync(JobRecoveryCase recovery, Guid? robotId, CancellationToken cancellationToken)
    {
        recovery.Phase = RecoveryPhases.AssessmentRequired;
        if (robotId is not { } id)
            return;
        try
        {
            if (await fleet.GetRobotAsync(id, cancellationToken) is not { } robot)
                return;
            recovery.LastPoseX = robot.PoseX;
            recovery.LastPoseY = robot.PoseY;
            recovery.LastPoseYaw = robot.PoseYaw;
            recovery.LastPoseAt = robot.LastTelemetryAt;
            recovery.FaultMapVersionId = robot.CurrentMapVersionId;
            recovery.FaultRobotOnline = robot.IsOnline;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The case opens anyway: the cargo matters more than the snapshot.
            logger.LogWarning(ex, "Recovery {CaseId}: robot {RobotId} snapshot not read", recovery.Id, id);
        }
    }

    // ------------------------------------------------------------------ request

    /// <summary>
    /// "Request Payload Recovery": a PAUSED Job with cargo on board becomes RECOVERY_REQUIRED with an open case. Asking
    /// again answers with the case already open (Help pressed twice opens one case).
    /// </summary>
    public async Task<JobRecoveryCase> RequestRecoveryAsync(Guid jobId, string? reason, CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var job = await LoadJobAsync(jobId, cancellationToken);
        var open = await db.JobRecoveryCases.FirstOrDefaultAsync(c => c.JobId == jobId && c.ResolvedAt == null, cancellationToken);
        if (job.Status == JobStatus.RECOVERY_REQUIRED && open is not null)
            return open;
        if (job.Status != JobStatus.PAUSED)
            throw new ConflictException($"Job {job.JobNo} is {job.Status}. Recovery is asked for a paused Job with cargo on board.",
                "recovery_request_not_paused");
        if (!job.JobContainers.Any(c => c.Status == JobContainerStatus.ONBOARD))
            throw new ConflictException($"Job {job.JobNo} has nothing on board: resume it or give it to another robot.", "recovery_no_cargo");

        var text = string.IsNullOrWhiteSpace(reason) ? "Payload recovery requested." : reason.Trim();
        if (text.Length > 500) text = text[..500];
        await OpenRecoveryAsync(job, "recovery_requested", text, DateTimeOffset.UtcNow, cancellationToken, transaction);
        return await db.JobRecoveryCases.SingleAsync(c => c.JobId == jobId && c.ResolvedAt == null, cancellationToken);
    }

    // ------------------------------------------------------------------ technician: assess, locate, evacuate, secure

    /// <summary>
    /// The technician's verdict on the failed robot. Self-evacuation needs the robot online, localized, on the Job's map
    /// and every checklist item passed; otherwise it is refused and the robot stays where it is.
    /// </summary>
    public async Task<JobRecoveryCase> AssessRecoveryAsync(
        Guid jobId, RecoveryCaseAccess access, string result, IReadOnlyList<RecoveryChecklistItem> checklist, string? note,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var (job, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        EnsureRecoveryVersion(recovery, access);
        if (recovery.Status != JobRecoveryStatuses.Open)
            throw new ConflictException("A robot is already on its way for this cargo; call it back to assess again.", "recovery_target_assigned");
        if (recovery.SourceSecuredAt is not null && result == RecoveryAssessmentResults.SelfEvacuationApproved)
            throw new ConflictException("The failed robot is already secured.", "recovery_source_secured");

        var verdict = (result ?? string.Empty).Trim().ToUpperInvariant();
        if (!RecoveryAssessmentResults.All.Contains(verdict))
            throw new DomainValidationException(
                $"The result must be one of {string.Join(", ", RecoveryAssessmentResults.All)}.", "recovery_assessment_invalid");
        var items = (checklist ?? []).Where(i => !string.IsNullOrWhiteSpace(i.Item)).Take(30)
            .Select(i => new RecoveryChecklistItem(i.Item.Trim()[..Math.Min(i.Item.Trim().Length, 120)], i.Ok,
                string.IsNullOrWhiteSpace(i.Note) ? null : i.Note.Trim()[..Math.Min(i.Note.Trim().Length, 300)]))
            .ToList();

        if (verdict is RecoveryAssessmentResults.SelfEvacuationApproved or RecoveryAssessmentResults.SameRobotRecoverable)
        {
            if (items.Count == 0 || items.Any(i => !i.Ok))
                throw new DomainValidationException(
                    "Every check must pass before the robot may move again; otherwise choose manual recovery.", "recovery_checklist_failed");
            var robotId = recovery.FromRobotId ?? throw new ConflictException("This Job had no robot.", "recovery_no_robot");
            var robot = await fleet.GetRobotAsync(robotId, cancellationToken)
                ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
            if (!robot.IsOnline || !robot.IsEnabled)
                throw new ConflictException($"Robot {robot.Code} is offline or disabled: it cannot move by itself.", "recovery_robot_offline");
            if (robot.CurrentMapVersionId != job.MapVersionId)
                throw new ConflictException($"Robot {robot.Code} runs another map than the Job.", "recovery_robot_wrong_map");
            EnsureRobotLocalized(robot, DateTimeOffset.UtcNow);
        }

        var now = DateTimeOffset.UtcNow;
        recovery.AssessmentResult = verdict;
        recovery.AssessedBy = access.Actor;
        recovery.AssessedAt = now;
        recovery.AssessmentChecklistJson = JsonSerializer.Serialize(items, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        recovery.AssessmentNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim()[..Math.Min(note.Trim().Length, 1000)];
        recovery.RecoveryMode = verdict switch
        {
            RecoveryAssessmentResults.SelfEvacuationApproved => RecoveryModes.SelfEvacuation,
            RecoveryAssessmentResults.SameRobotRecoverable => RecoveryModes.SameRobot,
            _ => RecoveryModes.Manual
        };
        if (recovery.SourceSecuredAt is null)
            recovery.Phase = RecoveryPhases.Assessed;
        recovery.Version++;
        await SaveAndPublishAsync(cancellationToken, transaction);
        logger.LogInformation("Job {JobNo}: recovery assessed {Result} by {Actor}", job.JobNo, verdict, access.Actor);
        return recovery;
    }

    /// <summary>A technician found the failed robot: at this endpoint, or at this point. The last pose was only a hint.</summary>
    public async Task<JobRecoveryCase> VerifyRecoveryLocationAsync(
        Guid jobId, RecoveryCaseAccess access, Guid? endpointId, double? x, double? y, CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var (job, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        EnsureRecoveryVersion(recovery, access);
        if (endpointId is { } id)
        {
            var pose = await navigation.GetEndpointPoseAsync(id, cancellationToken);
            if (pose is null || pose.MapVersionId != job.MapVersionId)
                throw new DomainValidationException("That endpoint is not on this Job's map.", "recovery_endpoint_invalid");
            (x, y) = (pose.X, pose.Y);
        }

        if (x is null || y is null || !double.IsFinite(x.Value) || !double.IsFinite(y.Value))
            throw new DomainValidationException("Say where the robot stands: an endpoint or a point.", "recovery_location_required");

        recovery.LocationVerified = true;
        recovery.VerifiedX = x;
        recovery.VerifiedY = y;
        recovery.LocationVerifiedBy = access.Actor;
        recovery.LocationVerifiedAt = DateTimeOffset.UtcNow;
        recovery.Version++;
        await SaveAndPublishAsync(cancellationToken, transaction);
        return recovery;
    }

    /// <summary>
    /// Approved self-evacuation: the failed robot drives itself, with its cargo, out of the way to a free parking place (the
    /// queue point only when none is free, since that is where the second robot comes), through traffic
    /// like any MOVE. Its STOP hold is released for that drive only. A failed drive asks for a person.
    /// </summary>
    public async Task<JobRecoveryCase> EvacuateRecoverySourceAsync(
        Guid jobId, RecoveryCaseAccess access, Guid? endpointId, CancellationToken cancellationToken = default)
    {
        await DispatchGate.WaitAsync(cancellationToken);
        try
        {
            return await EvacuateRecoverySourceCoreAsync(jobId, access, endpointId, cancellationToken);
        }
        finally
        {
            DispatchGate.Release();
        }
    }

    private async Task<JobRecoveryCase> EvacuateRecoverySourceCoreAsync(
        Guid jobId, RecoveryCaseAccess access, Guid? endpointId, CancellationToken cancellationToken)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var (job, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        EnsureRecoveryVersion(recovery, access);
        if (recovery.Status != JobRecoveryStatuses.Open)
            throw new ConflictException("A second robot is already on its way.", "recovery_target_assigned");
        if (recovery.RecoveryMode != RecoveryModes.SelfEvacuation)
            throw new ConflictException("Self-evacuation was not approved for this robot.", "recovery_motion_not_approved");
        if (recovery.Phase is not (RecoveryPhases.Assessed or RecoveryPhases.InterventionRequired))
            throw new ConflictException("The failed robot is already moving or secured.", "recovery_source_busy");

        var robotId = recovery.FromRobotId ?? throw new ConflictException("This Job had no robot.", "recovery_no_robot");
        var robot = await fleet.GetRobotAsync(robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
        if (!robot.IsOnline || !robot.IsEnabled || robot.InManualMode)
            throw new ConflictException($"Robot {robot.Code} cannot drive now (offline, disabled or driven by hand).", "recovery_robot_offline");
        EnsureRobotLocalized(robot, DateTimeOffset.UtcNow);

        var candidates = await RecoveryEndpointCandidatesAsync(job, recovery, forSource: true, cancellationToken);
        var chosen = endpointId is { } wanted
            ? candidates.FirstOrDefault(c => c.EndpointId == wanted)
                ?? throw new DomainValidationException("That endpoint is not a recovery point of this map.", "not_a_recovery_point")
            : candidates.FirstOrDefault(c => c.Unsuitable is null)
                ?? throw new ConflictException("No free recovery point: bring the robot to safety by hand.", "no_free_recovery_point");
        if (chosen.Unsuitable is { } why)
            throw new ConflictException($"{chosen.Code} cannot be used now ({why}).", "recovery_point_unsuitable");

        var (task, step, stepKey) = await NewRecoveryMoveAsync(job, robotId, chosen.EndpointId, cancellationToken);
        recovery.SourceEndpointId = chosen.EndpointId;
        recovery.SourceMoveStepId = step.Id;
        recovery.Phase = RecoveryPhases.SourceRepositioning;
        recovery.Version++;
        await SaveAndPublishAsync(cancellationToken, transaction);

        // The drive is durable from here: finish sending it even if the caller goes away.
        cancellationToken = CancellationToken.None;
        if (robot.MotionHeld)
            await fleet.ResumeRobotAsync(robotId, cancellationToken);
        await StartMoveAsync(job, task, step, stepKey, cancellationToken);
        if (step.Status == JobStepStatus.FAILED)
        {
            var problem = step.ErrorMessage;
            step.Status = JobStepStatus.SKIPPED;
            task.Status = JobTaskStatus.SKIPPED;
            recovery.Phase = RecoveryPhases.InterventionRequired;
            recovery.Version++;
            await SaveAndPublishAsync(cancellationToken);
            throw new ConflictException($"Robot {robot.Code} could not be sent: {problem}", "recovery_move_failed");
        }

        await SaveAndPublishAsync(cancellationToken);
        logger.LogInformation("Job {JobNo}: failed robot {Robot} evacuates to {Endpoint}", job.JobNo, robot.Code, chosen.Code);
        return recovery;
    }

    /// <summary>
    /// The failed robot stands still in a safe place (it arrived at its recovery point, or a technician confirmed where
    /// it stands): it is held (STOP) and a second robot may now come for the cargo.
    /// </summary>
    public async Task<JobRecoveryCase> SecureRecoverySourceAsync(
        Guid jobId, RecoveryCaseAccess access, string? note, CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var (job, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        EnsureRecoveryVersion(recovery, access);
        if (recovery.Status != JobRecoveryStatuses.Open)
            throw new ConflictException("A second robot is already on its way.", "recovery_target_assigned");
        if (recovery.AssessmentResult is null)
            throw new ConflictException("Assess the failed robot first.", "recovery_assessment_required");
        if (recovery.Phase == RecoveryPhases.SourceSecured)
            return recovery;

        if (recovery.Phase == RecoveryPhases.SourceRepositioning)
        {
            var arrived = OrderedSteps(job).Any(x => x.Step.Id == recovery.SourceMoveStepId && x.Step.Status == JobStepStatus.COMPLETED);
            if (!arrived)
                throw new ConflictException("The failed robot has not reached its recovery point yet.", "recovery_source_not_arrived");
        }

        var robot = recovery.FromRobotId is { } id ? await fleet.GetRobotAsync(id, cancellationToken) : null;
        var placeKnown = recovery.LocationVerified
            || recovery.Phase == RecoveryPhases.SourceRepositioning
            || robot is { IsOnline: true, LocalizationStatus: WaroTrans.Fleet.Enums.LocalizationStatus.LOCALIZED };
        if (!placeKnown)
            throw new ConflictException("Confirm where the failed robot stands first: its last pose is only a hint.", "recovery_location_unverified");
        if (recovery.RecoveryMode == RecoveryModes.Manual && !recovery.LocationVerified)
            throw new ConflictException("A robot recovered by hand needs its place confirmed first.", "recovery_location_unverified");

        recovery.Phase = RecoveryPhases.SourceSecured;
        recovery.SourceSecuredBy = access.Actor;
        recovery.SourceSecuredAt = DateTimeOffset.UtcNow;
        if (!string.IsNullOrWhiteSpace(note))
        {
            var joined = string.Join("\n", new[] { recovery.AssessmentNote, note.Trim() }.Where(n => !string.IsNullOrEmpty(n)));
            recovery.AssessmentNote = joined.Length <= 1000 ? joined : joined[..1000];
        }
        recovery.Version++;
        await SaveAndPublishAsync(cancellationToken, transaction);

        // Held from now: no motion while people take the cargo off.
        if (robot is { IsOnline: true, MotionHeld: false })
            await fleet.StopRobotAsync(robot.Id, "STOP", $"Payload recovery of {job.JobNo}: source secured", CancellationToken.None);
        return recovery;
    }

    // ------------------------------------------------------------------ custody (who holds each container)

    /// <summary>
    /// Who holds each container of the case now: the latest custody record, else the failed robot (the cargo has not been
    /// touched since the robot failed).
    /// </summary>
    public async Task<IReadOnlyDictionary<Guid, (string Type, Guid? Id)>> RecoveryCustodyAsync(
        JobRecoveryCase recovery, CancellationToken cancellationToken)
    {
        var records = await db.CargoTransferRecords.AsNoTracking()
            .Where(r => r.RecoveryCaseId == recovery.Id)
            .OrderBy(r => r.ConfirmedAt)
            .ToListAsync(cancellationToken);
        var custody = recovery.ContainerIds.ToDictionary(id => id, _ => (CustodyTypes.Robot, recovery.FromRobotId));
        foreach (var record in records.Where(r => custody.ContainsKey(r.ContainerId)))
            custody[record.ContainerId] = (record.ToCustodyType, record.ToCustodyId);
        return custody;
    }

    /// <summary>
    /// "Unload for recovery": staff scanned containers off the failed robot and now hold them (STAFF) or left them at a
    /// recovery point (RECOVERY_STATION). The robot must stand still. Some containers may stay on it; the second robot
    /// takes every one later, wherever it is. Warehouse stock does not change: the cargo is still in transit.
    /// </summary>
    public async Task<JobRecoveryCase> UnloadRecoveryCargoAsync(
        Guid jobId, RecoveryCaseAccess access, IReadOnlyList<HandoverStopScan> scans, string holder, Guid? endpointId, string? note,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var (job, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        EnsureRecoveryOwner(recovery, access);
        var holderType = (holder ?? string.Empty).Trim().ToUpperInvariant();
        if (!CustodyTypes.Holders.Contains(holderType))
            throw new DomainValidationException("Say who holds the cargo now: STAFF or RECOVERY_STATION.", "recovery_holder_invalid");
        if (holderType == CustodyTypes.RecoveryStation && endpointId is null)
            throw new DomainValidationException("Say which recovery point the cargo was left at.", "recovery_holder_invalid");
        if (RecoveryRequiresSourceSecured && recovery.Phase is not null && recovery.SourceSecuredAt is null)
            throw new ConflictException("A technician has to confirm the failed robot is secured first.", "recovery_source_not_secured");

        var robot = recovery.FromRobotId is { } fromId ? await fleet.GetRobotAsync(fromId, cancellationToken) : null;
        if (robot is { IsOnline: true, MotionHeld: false })
            throw new ConflictException($"Robot {robot.Code} is not holding still. Stop it before taking cargo off.", "robot_not_stopped");

        var custody = await RecoveryCustodyAsync(recovery, cancellationToken);
        var onRobot = custody.Where(c => c.Value.Type == CustodyTypes.Robot && c.Value.Id == recovery.FromRobotId).Select(c => c.Key).ToHashSet();
        var ids = (scans ?? []).Select(scan => scan.ContainerId).ToHashSet();
        if (ids.Count == 0 || !ids.IsSubsetOf(onRobot))
            throw new DomainValidationException("Scan only containers still on the failed robot.", "recovery_containers_mismatch");
        await VerifyContainerScansAsync(ids, scans, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var holderId = holderType == CustodyTypes.Staff ? access.Actor : endpointId;
        foreach (var containerId in ids)
        {
            var key = $"{recovery.Id:N}:{containerId:N}:unload";
            if (await db.CargoTransferRecords.AnyAsync(r => r.IdempotencyKey == key, cancellationToken))
                continue;
            db.CargoTransferRecords.Add(new CargoTransferRecord
            {
                Id = Guid.NewGuid(), RecoveryCaseId = recovery.Id, JobId = job.Id, ContainerId = containerId,
                FromCustodyType = CustodyTypes.Robot, FromCustodyId = recovery.FromRobotId,
                ToCustodyType = holderType, ToCustodyId = holderId, TransferEndpointId = endpointId,
                ConfirmedBy = access.Actor, ConfirmedAt = now, IdempotencyKey = key,
                Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim()[..Math.Min(note.Trim().Length, 500)]
            });
        }

        recovery.Version++;
        await SaveAndPublishAsync(cancellationToken, transaction);
        logger.LogInformation("Job {JobNo}: {Count} container(s) unloaded from the failed robot to {Holder}", job.JobNo, ids.Count, holderType);
        return recovery;
    }

    /// <summary>
    /// Manual disposition (WAROTRANS_PAYLOAD_RECOVERY_DESIGN.md 12.1): staff scanned containers off the failed robot and
    /// take them off the Job: RETURN_TO_STORAGE (back to a shelf) or QUARANTINE_CARGO (kept aside for a problem). Each
    /// container fails off the Job with a CONTAINER issue and Warehouse holds it where the robot stands; the issue's
    /// resolution says where it ends up (a shelf, scrapped …). With nothing left the case closes RESOLVED_MANUALLY and the
    /// Job ends (COMPLETED when something was delivered before, else FAILED). Others may still go to the second robot.
    /// </summary>
    public async Task<JobRecoveryCase> ResolveRecoveryManuallyAsync(
        Guid jobId, RecoveryCaseAccess access, string disposition, IReadOnlyList<HandoverStopScan> scans, string? problemCode,
        string? note, CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var (job, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        EnsureRecoveryOwner(recovery, access);
        var kind = (disposition ?? string.Empty).Trim().ToUpperInvariant();
        if (kind is not (RecoveryDispositions.ReturnToStorage or RecoveryDispositions.QuarantineCargo))
            throw new DomainValidationException("Choose RETURN_TO_STORAGE or QUARANTINE_CARGO.", "recovery_disposition_invalid");
        if (recovery.Status == JobRecoveryStatuses.TargetAssigned)
            throw new ConflictException("Call the second robot back before taking the cargo off by hand.", "recovery_target_assigned");

        var robot = recovery.FromRobotId is { } fromId ? await fleet.GetRobotAsync(fromId, cancellationToken) : null;
        if (robot is { IsOnline: true, MotionHeld: false })
            throw new ConflictException($"Robot {robot.Code} is not holding still. Stop it before taking cargo off.", "robot_not_stopped");

        var onBoard = job.JobContainers.Where(c => c.Status == JobContainerStatus.ONBOARD).Select(c => c.ContainerId).ToHashSet();
        var ids = (scans ?? []).Select(scan => scan.ContainerId).ToHashSet();
        if (ids.Count == 0 || !ids.IsSubsetOf(onBoard))
            throw new DomainValidationException("Scan only containers of this recovery that are still on the Job.", "recovery_containers_mismatch");
        await VerifyContainerScansAsync(ids, scans, cancellationToken);
        var code = kind == RecoveryDispositions.ReturnToStorage
            ? ContainerProblemCodes.Other
            : ContainerProblemFor(problemCode, atInspection: false);
        var reason = (kind == RecoveryDispositions.ReturnToStorage
                ? "Payload recovery: taken off by hand, to be returned to storage."
                : "Payload recovery: taken off by hand and quarantined.")
            + (string.IsNullOrWhiteSpace(note) ? string.Empty : $" {note.Trim()}");
        if (reason.Length > 500) reason = reason[..500];

        var now = DateTimeOffset.UtcNow;
        var custody = await RecoveryCustodyAsync(recovery, cancellationToken);
        var anchor = OrderedSteps(job).LastOrDefault(x => x.Step.Status != JobStepStatus.PENDING);
        var failures = new List<ContainerFailure>();
        foreach (var containerId in ids)
        {
            failures.Add(await FailContainerCoreAsync(job, anchor.Step ?? OrderedSteps(job).First().Step, containerId, code, reason, now, cancellationToken));
            var from = custody.TryGetValue(containerId, out var held) ? held : (CustodyTypes.Robot, recovery.FromRobotId);
            var key = $"{recovery.Id:N}:{containerId:N}:resolve";
            if (!await db.CargoTransferRecords.AnyAsync(r => r.IdempotencyKey == key, cancellationToken))
            {
                db.CargoTransferRecords.Add(new CargoTransferRecord
                {
                    Id = Guid.NewGuid(), RecoveryCaseId = recovery.Id, JobId = job.Id, ContainerId = containerId,
                    FromCustodyType = from.Item1, FromCustodyId = from.Item2, ToCustodyType = CustodyTypes.WarehouseHold,
                    ConfirmedBy = access.Actor, ConfirmedAt = now, IdempotencyKey = key, Note = kind
                });
            }
        }

        var left = job.JobContainers.Where(c => c.Status == JobContainerStatus.ONBOARD).Select(c => c.ContainerId).ToList();
        recovery.ContainerIds = left;
        if (left.Count == 0)
        {
            recovery.Status = JobRecoveryStatuses.ResolvedManually;
            recovery.ConfirmedBy = access.Actor;
            recovery.ConfirmedAt = now;
            recovery.Note = kind;
            recovery.ResolvedAt = now;
            if (job.Status == JobStatus.RECOVERY_REQUIRED)
            {
                // Something was delivered before the robot failed: the Job did what it could; nothing at all: it failed.
                var delivered = job.JobContainers.Any(c => c.Status == JobContainerStatus.DELIVERED);
                foreach (var (task, open) in OrderedSteps(job).Where(x => x.Step.Status is JobStepStatus.PENDING or JobStepStatus.READY
                             or JobStepStatus.WAITING or JobStepStatus.EXECUTING))
                {
                    open.Status = JobStepStatus.SKIPPED;
                    task.Status = JobTaskStatus.SKIPPED;
                }

                job.Status = delivered ? JobStatus.COMPLETED : JobStatus.FAILED;
                job.CompletedAt = now;
                job.FailureCode = delivered ? null : PayloadResolvedManuallyCode;
                job.FailureMessage = delivered ? null : reason;
                _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), AssignedRobot(job), job.FailureCode));
            }
        }

        recovery.Version++;
        await SaveAndPublishAsync(cancellationToken, transaction);
        logger.LogWarning("Job {JobNo}: {Count} container(s) taken off by hand in recovery ({Disposition})", job.JobNo, ids.Count, kind);

        var heldAt = recovery.SourceEndpointId ?? recovery.RecoveryEndpointId;
        foreach (var failure in failures)
            await ReportRecoveryContainerAsync(job, failure, kind, heldAt, access.Actor, cancellationToken);
        return recovery;
    }

    /// <summary>The Job ended because its cargo was taken off by hand in a payload recovery.</summary>
    public const string PayloadResolvedManuallyCode = "payload_resolved_manually";

    private async Task ReportRecoveryContainerAsync(
        Job job, ContainerFailure failure, string disposition, Guid? heldAt, Guid? actorId, CancellationToken cancellationToken)
    {
        if (issueReporter is null) return;
        var containerId = failure.Container.ContainerId;
        try
        {
            var issueId = await issueReporter.ReportContainerProblemAsync(
                new ContainerProblemDraft(
                    $"recovery:{job.Id:N}:{containerId:N}", job.Id, job.JobNo, null, null, containerId,
                    failure.Container.TransportRequestId, AssignedRobot(job), actorId, failure.Code, [failure.Code],
                    $"{failure.Reason} Taken off Job {job.JobNo} after its robot failed ({disposition}). "
                    + (disposition == RecoveryDispositions.ReturnToStorage
                        ? "Resolve this issue with the shelf it goes back to."
                        : "Keep it aside until the problem is checked."),
                    RemovedFromJob: true, HeldAtEndpointId: heldAt),
                cancellationToken);
            if (containerHolds is not null)
                await containerHolds.HoldAsync(
                    new ContainerHoldRequest(containerId, failure.Code, issueId, ContainerHoldMode.NOW, heldAt, job.Id, actorId, failure.Reason),
                    cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(exception, "Job {JobNo}: container {ContainerId} taken off in recovery but its issue or hold failed", job.JobNo, containerId);
        }
    }

    /// <summary>The transfer to the second robot: one custody record per container, from wherever it was.</summary>
    private async Task RecordLoadOnRecoveryRobotAsync(
        JobRecoveryCase recovery, Guid target, Guid? confirmedBy, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var custody = await RecoveryCustodyAsync(recovery, cancellationToken);
        foreach (var (containerId, from) in custody)
        {
            var key = $"{recovery.Id:N}:{containerId:N}:load";
            if (await db.CargoTransferRecords.AnyAsync(r => r.IdempotencyKey == key, cancellationToken))
                continue;
            db.CargoTransferRecords.Add(new CargoTransferRecord
            {
                Id = Guid.NewGuid(), RecoveryCaseId = recovery.Id, JobId = recovery.JobId, ContainerId = containerId,
                FromCustodyType = from.Type, FromCustodyId = from.Id, ToCustodyType = CustodyTypes.Robot, ToCustodyId = target,
                TransferEndpointId = recovery.RecoveryEndpointId, ConfirmedBy = confirmedBy, ConfirmedAt = now, IdempotencyKey = key
            });
        }
    }

    // ------------------------------------------------------------------ recovery points

    /// <summary>
    /// Where the failed robot (<paramref name="forSource"/>) or the second robot may go: wait points (QUEUE …) of the Job's
    /// map, plus parking places for the second robot. Ranked free first, then by the length of the way from the cargo.
    /// The second robot never gets the failed robot's place.
    /// </summary>
    public async Task<IReadOnlyList<RecoveryEndpointCandidate>> ListRecoveryEndpointCandidatesAsync(
        Guid jobId, bool forSource, CancellationToken cancellationToken = default)
    {
        var (job, recovery) = await LoadRecoveryAsync(jobId, cancellationToken);
        return await RecoveryEndpointCandidatesAsync(job, recovery, forSource, cancellationToken);
    }

    private async Task<IReadOnlyList<RecoveryEndpointCandidate>> RecoveryEndpointCandidatesAsync(
        Job job, JobRecoveryCase recovery, bool forSource, CancellationToken cancellationToken)
    {
        var configured = WaitPoints.ConfiguredCodes(freeEndpoints?.FallbackEndpointCodes, trafficOptions?.Value.DeadlockRetreatEndpointCodes);
        var endpoints = (await navigation.GetEndpointsOnMapAsync(job.MapVersionId, cancellationToken))
            // The recovery point is the queue point (one on the lab map): it is where the second robot takes the cargo.
            // The failed robot, when it may drive at all, goes out of the way to a free parking place, the queue point
            // only when no parking place is free.
            .Where(e => WaitPoints.IsStandAside(e, configured))
            .ToList();
        if (endpoints.Count == 0)
            return [];

        var source = recovery.FromRobotId is { } fromId ? await fleet.GetRobotAsync(fromId, cancellationToken) : null;
        // Where the cargo is: the place a technician confirmed, else the robot's pose, else its last pose.
        var origin = recovery.VerifiedX is { } vx && recovery.VerifiedY is { } vy ? (vx, vy)
            : source is not null ? (source.PoseX, source.PoseY)
            : (recovery.LastPoseX ?? 0, recovery.LastPoseY ?? 0);

        var taken = new HashSet<Guid>();
        var others = new List<(double X, double Y)>();
        var radius = 0.35;
        if (freeEndpoints is not null && source is not null)
        {
            var (t, o) = await freeEndpoints.TakenAsync(source, job.Id, cancellationToken);
            taken = t;
            others = o.ToList();
            radius = freeEndpoints.OccupiedRadiusMeters;
        }

        CostGridHolder grid = new(trafficOptions?.Value.SemanticMapDirectory);
        var list = new List<RecoveryEndpointCandidate>();
        foreach (var e in endpoints)
        {
            var straight = Math.Sqrt(Math.Pow(e.X - origin.Item1, 2) + Math.Pow(e.Y - origin.Item2, 2));
            double? path = grid.PathMeters(origin.Item1, origin.Item2, e.X, e.Y);
            string? unsuitable = null;
            if (!forSource && (e.Id == recovery.SourceEndpointId || straight <= Math.Max(e.PositionTolerance, radius)))
                unsuitable = "failed_robot_there";
            else if (taken.Contains(e.Id))
                unsuitable = "taken";
            else if (others.Any(r => Math.Sqrt(Math.Pow(r.X - e.X, 2) + Math.Pow(r.Y - e.Y, 2)) <= Math.Max(e.PositionTolerance, radius)))
                unsuitable = "robot_standing_there";
            else if (path is null && grid.Loaded)
                unsuitable = "no_path";
            list.Add(new RecoveryEndpointCandidate(e.Id, e.Code, e.Name, e.EndpointType.ToString(), Math.Round(straight, 2),
                path is { } p ? Math.Round(p, 2) : null, unsuitable));
        }

        return list
            .OrderBy(c => c.Unsuitable is null ? 0 : 1)
            // The failed robot prefers a parking place, the second robot the recovery (queue) point.
            .ThenBy(c => forSource
                ? (c.EndpointType == nameof(EndpointType.PARK) ? 0 : 1)
                : (c.EndpointType == nameof(EndpointType.PARK) ? 1 : 0))
            .ThenBy(c => c.PathMeters ?? c.DistanceMeters)
            .ThenBy(c => c.Code, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>The map's costmap, loaded once per call, for path lengths; nothing when no bundle is configured.</summary>
    private sealed class CostGridHolder(string? directory)
    {
        private readonly RouteCostEvaluator.CostGrid? _grid =
            !string.IsNullOrWhiteSpace(directory) && Directory.Exists(directory.Trim()) ? RouteCostEvaluator.FromBundle(directory.Trim()) : null;

        public bool Loaded => _grid is not null;

        public double? PathMeters(double sx, double sy, double gx, double gy)
        {
            if (_grid is null)
                return null;
            try
            {
                var route = RouteCostEvaluator.Plan(_grid, sx, sy, gx, gy);
                return route.Found ? route.LengthMeters : null;
            }
            catch (Exception)
            {
                return null;
            }
        }
    }

    // ------------------------------------------------------------------ the recovery MOVE (failed robot or second robot)

    /// <summary>A MOVE of this Job for a recovery (executionScope RECOVERY), sorted first, for the given robot and place.</summary>
    private async Task<(JobTask Task, JobStep Step, string StepKey)> NewRecoveryMoveAsync(
        Job job, Guid robotId, Guid endpointId, CancellationToken cancellationToken)
    {
        var moveDefinition = await db.WorkflowSteps.AsNoTracking()
            .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId && s.StepType == StepType.MOVE)
            .OrderBy(s => s.SequenceNo)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new ConflictException("This workflow has no MOVE to send a robot with.", "recovery_no_move_step");
        var now = DateTimeOffset.UtcNow;
        var task = new JobTask
        {
            Id = Guid.NewGuid(),
            JobId = job.Id,
            WorkflowTaskId = moveDefinition.WorkflowTaskId,
            SequenceNo = job.JobTasks.Min(t => t.SequenceNo) - 1,
            Status = JobTaskStatus.RUNNING,
            StartedAt = now,
            ContextValues = new Dictionary<string, JsonElement>
            {
                ["executionScope"] = JsonSerializer.SerializeToElement("RECOVERY"),
                ["stopEndpointId"] = JsonSerializer.SerializeToElement(endpointId)
            }
        };
        var step = new JobStep
        {
            Id = Guid.NewGuid(),
            JobTaskId = task.Id,
            WorkflowStepId = moveDefinition.Id,
            SequenceNo = 1,
            StepType = StepType.MOVE,
            Status = JobStepStatus.PENDING,
            TargetEndpointId = endpointId,
            ResolvedInputs = new Dictionary<string, JsonElement>
            {
                ["robotId"] = JsonSerializer.SerializeToElement(robotId),
                ["targetEndpointId"] = JsonSerializer.SerializeToElement(endpointId)
            },
            StartedAt = now
        };
        task.JobSteps.Add(step);
        db.JobTasks.Add(task);
        job.JobTasks.Add(task);
        return (task, step, moveDefinition.StepKey);
    }

    /// <summary>
    /// A Job in RECOVERY_REQUIRED does not advance, but its recovery MOVEs do: a result moves the case on (arrived,
    /// failed → a person decides), and a MOVE woken from a wait (traffic, queue point) is sent again.
    /// </summary>
    private async Task SyncRecoveryAsync(Job job, CancellationToken cancellationToken, IDbContextTransaction? transaction)
    {
        var recovery = await db.JobRecoveryCases.FirstOrDefaultAsync(c => c.JobId == job.Id && c.ResolvedAt == null, cancellationToken);
        if (recovery is null)
            return;

        var changed = false;
        foreach (var stepId in new[] { recovery.SourceMoveStepId, recovery.MoveStepId })
        {
            var entry = OrderedSteps(job).FirstOrDefault(x => x.Step.Id == stepId);
            if (entry.Step is not { } step)
                continue;
            var isSource = stepId == recovery.SourceMoveStepId;
            switch (step.Status)
            {
                case JobStepStatus.READY:
                    var key = await db.WorkflowSteps.AsNoTracking().Where(s => s.Id == step.WorkflowStepId)
                        .Select(s => s.StepKey).FirstOrDefaultAsync(cancellationToken) ?? step.Id.ToString("N");
                    await StartMoveAsync(job, entry.Task, step, key, cancellationToken);
                    changed = true;
                    break;
                case JobStepStatus.COMPLETED when !isSource && recovery.Phase == RecoveryPhases.TargetEnRoute:
                    recovery.Phase = RecoveryPhases.AwaitingTransfer;
                    recovery.Version++;
                    changed = true;
                    break;
                case JobStepStatus.FAILED or JobStepStatus.CANCELLED
                    when recovery.Phase is RecoveryPhases.SourceRepositioning or RecoveryPhases.TargetEnRoute:
                    recovery.Phase = RecoveryPhases.InterventionRequired;
                    recovery.Version++;
                    changed = true;
                    logger.LogWarning("Job {JobNo}: recovery MOVE {Step} {Status}; a person has to decide", job.JobNo, step.Id, step.Status);
                    break;
            }
        }

        if (changed)
            await SaveAndPublishAsync(cancellationToken, transaction);
    }
}
