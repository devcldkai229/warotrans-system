using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations.Features.IssueReports;

public sealed record ListIssuesQuery(
    string? Status,
    string? IssueType,
    string? Severity,
    Guid? AssigneeId,
    Guid? JobId,
    Guid? RobotId,
    bool Mine,
    int Skip,
    int Take,
    DateTimeOffset? ReportedFrom = null,
    DateTimeOffset? ReportedTo = null,
    string? ProblemCode = null);

/// <summary>
/// IssueReport lifecycle (OPS-01). Who sees what:
/// Admin all issues; Technician the ones they reported, are assigned to, or that concern a robot in their scope;
/// Staff the ones they reported or are assigned to. An issue outside that set is "not found".
/// </summary>
public sealed partial class IssueService(
    OperationsMongoContext mongo,
    ICurrentUser currentUser,
    IHttpContextAccessor httpContextAccessor,
    IRobotAccessScope robotAccessScope,
    INotificationService notifications,
    IAuditTrail audit,
    IHandoverIssueVerifier handoverVerifier,
    IWarehouseMapLocations mapLocations,
    IStaffOperatingWarehouse staffWarehouse,
    IWarehouseRobotLookup robotLookup,
    TimeProvider clock,
    IContainerHolds? containerHolds = null) : IIssueReporter
{
    public const int MaxTake = 100;
    private const string Entity = "ISSUE";

    private static NotFoundException NotFound() => new("The issue was not found.", "issue_not_found");

    // ------------------------------------------------------------------ create

    public async Task<IssueDto> CreateHazardAsync(CreateHazardRequest request, CancellationToken cancellationToken)
    {
        var me = currentUser.AccountId ?? throw new AppException("Sign in to report a hazard.", 401, "unauthenticated");
        var key = $"hazard:{me:N}:{request.RequestId:N}";
        var severity = Enum.Parse<IssueSeverity>(request.Severity);
        var description = request.Description.Trim();
        var issue = await mongo.IssueReports.Find(item => item.SourceKey == key)
            .Project<IssueReport>(WithoutPhotoBytes).FirstOrDefaultAsync(cancellationToken);
        if (issue is null)
        {
            var location = await mapLocations.FindPublishedLocationAsync(request.MapVersionId, request.EdgeId, request.ZoneId,
                request.EndpointId, cancellationToken)
                ?? throw new DomainValidationException("Choose an active corridor, zone or endpoint on a published map.", "hazard_location_invalid");
            await EnsureHazardWarehouseAccessAsync(location.WarehouseId, cancellationToken);
            var id = await CreateOnceAsync(key, me, now =>
            {
                var created = NewIssue(me, now);
                created.IssueType = IssueType.OTHER;
                created.Severity = severity;
                created.Description = description;
                created.Hazard = new HazardLocation(location.WarehouseId, request.MapVersionId, request.EdgeId,
                    request.ZoneId, request.EndpointId, location.Code, request.HazardType);
                return created;
            }, cancellationToken);
            issue = await LoadVisibleAsync(id, cancellationToken);
        }

        if (issue.Hazard is not { } hazard || hazard.MapVersionId != request.MapVersionId || hazard.EdgeId != request.EdgeId
            || hazard.ZoneId != request.ZoneId || hazard.EndpointId != request.EndpointId || hazard.HazardType != request.HazardType
            || issue.Severity != severity || issue.Description != description)
            throw new ConflictException("This request id was already used for another hazard report.", "hazard_request_conflict");
        await EnsureHazardWarehouseAccessAsync(hazard.WarehouseId, cancellationToken);
        if (issue.Status is not (IssueStatus.RESOLVED or IssueStatus.CLOSED))
            await PublishHazardAsync(issue, hazard, cancellationToken);
        return Project(issue);
    }

    private async Task EnsureHazardWarehouseAccessAsync(Guid warehouseId, CancellationToken cancellationToken)
    {
        if (currentUser.Role == AppRoles.Staff && await staffWarehouse.GetOperatingWarehouseIdAsync(cancellationToken) != warehouseId)
            throw new AppException("Choose a location in your current warehouse.", 403, "hazard_warehouse_out_of_scope");
        if (currentUser.Role == AppRoles.Technician)
        {
            var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
            if (!scope.AllRobots && !(await robotLookup.GetWarehousesAsync(scope.RobotIds, cancellationToken)).Contains(warehouseId))
                throw new AppException("This warehouse is outside your robot scope.", 403, "hazard_warehouse_out_of_scope");
        }
    }

    private Task<Guid?> PublishHazardAsync(IssueReport issue, HazardLocation hazard, CancellationToken cancellationToken) =>
        notifications.PublishAsync(new NotificationDraft(
            issue.Severity >= IssueSeverity.HIGH ? NotificationType.ALERT : NotificationType.WARNING,
            "WAREHOUSE_HAZARD", $"Hazard at {hazard.LocationCode}", Shorten(issue.Description),
            Entity, issue.Id, $"issue:{issue.Id}:open", OncePerSituation: true,
            Audience: new NotificationAudience([AppRoles.Admin, AppRoles.Staff, AppRoles.Technician], WarehouseId: hazard.WarehouseId)),
            cancellationToken);

    public async Task<IssueDto> CreateAsync(CreateIssueRequest request, CancellationToken cancellationToken)
    {
        var me = currentUser.AccountId ?? throw new AppException("Sign in to report an issue.", 401, "unauthenticated");
        if (request.RobotId is { } robotId && !await robotAccessScope.CanAccessRobotAsync(robotId, cancellationToken))
        {
            throw new AppException("This robot is not assigned to you.", 403, "robot_out_of_scope");
        }

        var now = clock.GetUtcNow();
        var issue = NewIssue(me, now);
        issue.IssueType = Enum.Parse<IssueType>(request.IssueType);
        issue.Severity = Enum.Parse<IssueSeverity>(request.Severity);
        issue.Description = request.Description.Trim();
        issue.ContainerId = request.ContainerId;
        issue.TransportRequestId = request.TransportRequestId;
        issue.JobId = request.JobId;
        issue.JobStepId = request.JobStepId;
        issue.StorageLocationId = request.StorageLocationId;
        issue.RobotId = request.RobotId;
        issue.ProblemCode = request.ProblemCode;
        issue.Evidence = (request.Evidence ?? []).Select(e => ToEvidence(e, me, now)).ToList();

        await using (var subjectLock = issue.ProblemCode is null
            ? null
            : await handoverVerifier.LockSubjectAsync(issue.JobId!.Value, issue.ContainerId!.Value, issue.JobStepId, cancellationToken))
        {
            await mongo.IssueReports.InsertOneAsync(issue, cancellationToken: cancellationToken);
        }
        await AfterCreatedAsync(issue, cancellationToken);

        // Reported but still carried (damaged, inside not as declared ...): it goes on, and is held where it arrives.
        ContainerHoldSnapshot? hold = null;
        if (issue.ContainerId is { } containerId && containerHolds is not null
            && ContainerProblemCodes.Find(issue.ProblemCode) is { HoldsWhenReported: true })
        {
            hold = await containerHolds.HoldAsync(
                new ContainerHoldRequest(containerId, issue.ProblemCode!, issue.Id, ContainerHoldMode.ON_DELIVERY,
                    JobId: issue.JobId, ActorAccountId: me, Note: Shorten(issue.Description)),
                cancellationToken);
        }

        return Project(issue, hold);
    }

    /// <summary>WFX-05: a HUMAN REPORT_ISSUE step. Idempotent on the step, so a retried confirmation reuses the issue.</summary>
    public async Task<Guid> ReportFromStepAsync(StepIssueDraft draft, CancellationToken cancellationToken = default)
    {
        var sourceKey = $"step:{draft.JobStepId}";
        return await CreateOnceAsync(sourceKey, draft.ReportedBy, now =>
        {
            var issue = NewIssue(draft.ReportedBy ?? Guid.Empty, now);
            issue.IssueType = draft.RobotId is null ? IssueType.JOB : IssueType.ROBOT;
            issue.Severity = IssueSeverity.MEDIUM;
            issue.Description = draft.Description;
            issue.JobId = draft.JobId;
            issue.JobStepId = draft.JobStepId;
            issue.RobotId = draft.RobotId;
            issue.ContainerId = draft.ContainerId;
            issue.Metadata = new MongoDB.Bson.BsonDocument { ["jobNo"] = draft.JobNo, ["stepKey"] = draft.StepKey };
            return issue;
        }, cancellationToken);
    }

    /// <summary>
    /// A container problem seen by a person at a handover or at inspection ("Container failed", a failed inspection):
    /// a CONTAINER issue with its problem code. Idempotent on the source key. Holding the container is the caller's.
    /// </summary>
    public Task<Guid> ReportContainerProblemAsync(ContainerProblemDraft draft, CancellationToken cancellationToken = default) =>
        CreateOnceAsync($"container:{draft.SourceKey}", draft.ReportedBy, now =>
        {
            var rule = ContainerProblemCodes.Find(draft.ProblemCode);
            var issue = NewIssue(draft.ReportedBy ?? Guid.Empty, now);
            issue.IssueType = IssueType.CONTAINER;
            issue.Severity = rule is { High: true } ? IssueSeverity.HIGH : IssueSeverity.MEDIUM;
            issue.ProblemCode = draft.ProblemCode;
            issue.Description = draft.Description;
            issue.JobId = draft.JobId;
            issue.JobStepId = draft.JobStepId;
            issue.ContainerId = draft.ContainerId;
            issue.TransportRequestId = draft.TransportRequestId;
            issue.RobotId = draft.RobotId;
            issue.Metadata = new MongoDB.Bson.BsonDocument
            {
                ["jobNo"] = draft.JobNo,
                ["stepKey"] = draft.StepKey ?? string.Empty,
                ["defects"] = new MongoDB.Bson.BsonArray(draft.Defects.Count > 0 ? draft.Defects : [draft.ProblemCode]),
                ["removedFromJob"] = draft.RemovedFromJob,
                ["source"] = draft.SourceKey
            };
            if (draft.HeldAtEndpointId is { } at) issue.Metadata["heldAtEndpointId"] = at.ToString();
            return issue;
        }, cancellationToken);

    /// <summary>An issue the system raises (e.g. cargo on a robot of a cancelled request). Idempotent on the source key.</summary>
    public Task<Guid> ReportAsync(SystemIssueDraft draft, CancellationToken cancellationToken = default) =>
        CreateOnceAsync($"system:{draft.SourceKey}", draft.ReportedBy, now =>
        {
            var issue = NewIssue(draft.ReportedBy ?? Guid.Empty, now);
            issue.IssueType = draft.TransportRequestId is not null ? IssueType.TRANSPORT : IssueType.JOB;
            issue.TransportRequestId = draft.TransportRequestId;
            issue.Severity = draft.High ? IssueSeverity.HIGH : IssueSeverity.MEDIUM;
            issue.Description = draft.Description;
            issue.JobId = draft.JobId;
            issue.RobotId = draft.RobotId;
            issue.ContainerId = draft.ContainerId;
            issue.Metadata = new MongoDB.Bson.BsonDocument { ["jobNo"] = draft.JobNo, ["source"] = draft.SourceKey };
            return issue;
        }, cancellationToken);

    private async Task<Guid> CreateOnceAsync(string sourceKey, Guid? reportedBy, Func<DateTimeOffset, IssueReport> build, CancellationToken cancellationToken)
    {
        var existing = await mongo.IssueReports.Find(i => i.SourceKey == sourceKey).Project(i => i.Id).FirstOrDefaultAsync(cancellationToken);
        if (existing != Guid.Empty)
        {
            return existing;
        }

        var issue = build(clock.GetUtcNow());
        issue.SourceKey = sourceKey;

        try
        {
            await mongo.IssueReports.InsertOneAsync(issue, cancellationToken: cancellationToken);
        }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            // Two confirmations raced: the other one created it.
            return await mongo.IssueReports.Find(i => i.SourceKey == sourceKey).Project(i => i.Id).FirstAsync(cancellationToken);
        }

        await AfterCreatedAsync(issue, cancellationToken);
        return issue.Id;
    }

    private async Task AfterCreatedAsync(IssueReport issue, CancellationToken cancellationToken)
    {
        await audit.RecordAsync(
            new AuditEntry("issue.reported", Entity, issue.Id, After: Snapshot(issue)),
            cancellationToken);

        if (issue.Hazard is not null) return;
        await notifications.PublishAsync(
            new NotificationDraft(
                issue.Severity >= IssueSeverity.HIGH ? NotificationType.ALERT : NotificationType.WARNING,
                "ISSUE_REPORTED",
                $"Issue {issue.Code} reported ({issue.Severity})",
                Shorten(issue.Description),
                Entity,
                issue.Id,
                $"issue:{issue.Id}:open",
                OncePerSituation: true,
                Audience: issue.RobotId is { } robotId ? NotificationAudience.RobotCare(robotId) : NotificationAudience.Admins),
            cancellationToken);
    }

    // ------------------------------------------------------------------ read

    public async Task<ListIssuesResponse> ListAsync(ListIssuesQuery query, CancellationToken cancellationToken)
    {
        IssueListFilters.EnsureReportedRange(query.ReportedFrom, query.ReportedTo);
        var f = Builders<IssueReport>.Filter;
        var filters = new List<FilterDefinition<IssueReport>> { await VisibleFilterAsync(cancellationToken) };

        if (TryParse<IssueStatus>(query.Status) is { } status) filters.Add(f.Eq(i => i.Status, status));
        if (TryParse<IssueSeverity>(query.Severity) is { } severity) filters.Add(f.Eq(i => i.Severity, severity));
        if (query.AssigneeId is { } assignee) filters.Add(f.Eq(i => i.AssigneeId, assignee));
        if (query.JobId is { } jobId) filters.Add(f.Eq(i => i.JobId, jobId));
        if (query.RobotId is { } robotId) filters.Add(f.Eq(i => i.RobotId, robotId));
        if (query.Mine && currentUser.AccountId is { } me) filters.Add(f.Or(f.Eq(i => i.ReportedBy, me), f.Eq(i => i.AssigneeId, me)));
        if (query.ReportedFrom is { } from) filters.Add(f.Gte(i => i.ReportedAt, from));
        if (query.ReportedTo is { } to) filters.Add(f.Lt(i => i.ReportedAt, to));
        if (!string.IsNullOrWhiteSpace(query.ProblemCode)) filters.Add(f.Eq(i => i.ProblemCode, query.ProblemCode));

        // The type tabs count under every filter but the type itself.
        var allTypes = f.And(filters);
        var perType = await mongo.IssueReports.Aggregate()
            .Match(allTypes)
            .Group(i => i.IssueType, g => new { Type = g.Key, Count = g.LongCount() })
            .ToListAsync(cancellationToken);
        var countsByType = IssueListFilters.CountsByType(perType.Select(c => KeyValuePair.Create(c.Type, c.Count)));

        if (TryParse<IssueType>(query.IssueType) is { } type) filters.Add(f.Eq(i => i.IssueType, type));
        var filter = f.And(filters);
        var total = await mongo.IssueReports.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var items = await mongo.IssueReports.Find(filter)
            .SortByDescending(i => i.ReportedAt)
            .Skip(Math.Max(0, query.Skip))
            .Limit(Math.Clamp(query.Take, 1, MaxTake))
            .Project<IssueReport>(WithoutPhotoBytes)
            .ToListAsync(cancellationToken);
        return new ListIssuesResponse(total, items.Select(Project).ToList(), countsByType);
    }

    public async Task<IssueDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var issue = await LoadVisibleAsync(id, cancellationToken);
        return Project(issue, await ContainerOfAsync(issue, cancellationToken));
    }

    /// <summary>The container the issue is about, as Warehouse has it now (held by this issue or not).</summary>
    private async Task<ContainerHoldSnapshot?> ContainerOfAsync(IssueReport issue, CancellationToken cancellationToken) =>
        issue.ContainerId is { } containerId && containerHolds is not null
            ? await containerHolds.GetAsync(containerId, cancellationToken)
            : null;

    /// <summary>The container this issue holds, if it holds one.</summary>
    private async Task<ContainerHoldSnapshot?> HeldContainerAsync(IssueReport issue, CancellationToken cancellationToken) =>
        await ContainerOfAsync(issue, cancellationToken) is { } container && container.HoldIssueId == issue.Id ? container : null;

    public async Task<bool> HasBlockingHandoverIssueAsync(
        Guid jobId, IReadOnlyCollection<Guid> containerIds, CancellationToken cancellationToken = default)
    {
        if (containerIds.Count == 0) return false;

        var f = Builders<IssueReport>.Filter;
        var filter = f.Eq(issue => issue.JobId, jobId)
            & f.In(issue => issue.ContainerId, containerIds.Select(id => (Guid?)id))
            & f.In(issue => issue.ProblemCode, HandoverProblemCodes.Blocking)
            & f.In(issue => issue.Status, new[] { IssueStatus.OPEN, IssueStatus.ACKNOWLEDGED, IssueStatus.IN_PROGRESS });
        return await mongo.IssueReports.Find(filter).Project(issue => issue.Id).AnyAsync(cancellationToken);
    }

    // ------------------------------------------------------------------ change

    public async Task<IssueDto> AssignAsync(Guid id, AssignIssueRequest request, CancellationToken cancellationToken)
    {
        var issue = await LoadVisibleAsync(id, cancellationToken);
        if (issue.Status == IssueStatus.CLOSED)
        {
            throw new ConflictException("A closed issue cannot be reassigned.", "issue_closed");
        }

        var before = issue.AssigneeId;
        var updated = await SaveAsync(
            issue,
            request.ExpectedVersion,
            Builders<IssueReport>.Update.Set(i => i.AssigneeId, request.AssigneeId),
            cancellationToken);

        await audit.RecordAsync(
            new AuditEntry("issue.assigned", Entity, id,
                Before: new Dictionary<string, object?> { ["assigneeId"] = before },
                After: new Dictionary<string, object?> { ["assigneeId"] = request.AssigneeId }),
            cancellationToken);

        if (request.AssigneeId is { } assignee && assignee != currentUser.AccountId)
        {
            await notifications.PublishAsync(
                new NotificationDraft(
                    NotificationType.ASSIGNMENT,
                    "ISSUE_ASSIGNED",
                    $"Issue {updated.Code} was assigned to you",
                    Shorten(updated.Description),
                    Entity,
                    id,
                    Audience: NotificationAudience.Person(assignee)),
                cancellationToken);
        }

        return Project(updated);
    }

    public async Task<IssueDto> TransitionAsync(Guid id, TransitionIssueRequest request, CancellationToken cancellationToken)
    {
        var issue = await LoadVisibleAsync(id, cancellationToken);
        var to = Enum.Parse<IssueStatus>(request.Status);
        var held = await HeldContainerAsync(issue, cancellationToken);
        if (HandoverProblemCodes.Blocking.Contains(issue.ProblemCode) && held is null)
        {
            if (to == IssueStatus.CLOSED && issue.Status != IssueStatus.RESOLVED)
                throw new ConflictException("Verify the expected container before closing this issue.", "issue_handover_verification_required");
            if (to == IssueStatus.RESOLVED)
                await VerifyHandoverBarcodeAsync(issue, request.ScannedBarcode, cancellationToken);
        }

        string? outcomeNote = null;
        if (held is not null && to is IssueStatus.RESOLVED or IssueStatus.CLOSED)
        {
            // The container waits on this issue: resolving it says what becomes of the container.
            if (to == IssueStatus.CLOSED)
                throw new ConflictException($"Resolve this issue first and say what becomes of container {held.Barcode}.", "issue_container_outcome_required");
            if (request.ContainerOutcome is null)
                throw new DomainValidationException($"Choose what becomes of container {held.Barcode}.", "issue_container_outcome_required");
            if (request.ExpectedVersion != issue.Version)
                throw new ConflictException("The issue was changed by someone else; reload it.", "issue_version_conflict");
            EnsureOutcomeFits(issue, held, request.ContainerOutcome, request.ContentsQuantity);
            var after = await containerHolds!.ReleaseAsync(
                new ContainerReleaseRequest(held.ContainerId, issue.Id, request.ContainerOutcome, request.ContentsQuantity,
                    currentUser.AccountId, request.Resolution),
                cancellationToken);
            outcomeNote = $"Container {held.Barcode}: {request.ContainerOutcome}"
                + (request.ContainerOutcome == ContainerHoldOutcomes.AdjustQuantity ? $" ({request.ContentsQuantity} {after.ContentsUnit})" : string.Empty)
                + $", now {after.Status}" + (after.HoldReasonCode is { } still ? $" ({still})" : string.Empty);
        }

        return await TransitionCoreAsync(issue, to, request.ExpectedVersion, request.Resolution, request.ScannedBarcode, cancellationToken, outcomeNote,
            held is not null ? request.ContainerOutcome : null);
    }

    /// <summary>
    /// The outcome must be one the problem allows (a box with the wrong product inside can only be scrapped), and a
    /// partly damaged box keeps fewer goods than it had.
    /// </summary>
    public static void EnsureOutcomeFits(IssueReport issue, ContainerHoldSnapshot held, string outcome, decimal? quantity)
    {
        var allowed = ContainerProblemCodes.OutcomesFor(issue.ProblemCode);
        if (!allowed.Contains(outcome))
            throw new DomainValidationException(
                $"{outcome} does not fit {issue.ProblemCode ?? ContainerProblemCodes.Other}: choose {string.Join(", ", allowed)}.",
                "issue_container_outcome_not_allowed");
        if (issue.ProblemCode == ContainerProblemCodes.ContentsDamaged && outcome == ContainerHoldOutcomes.AdjustQuantity
            && held.ContentsQuantity is { } had && quantity is { } left && left >= had)
            throw new DomainValidationException(
                $"Enter the goods still good: less than the {had:0.###} the box holds.",
                "container_quantity_not_reduced");
    }

    public async Task<IssueDto> ResolveOwnHandoverAsync(Guid id, ResolveOwnHandoverIssueRequest request, CancellationToken cancellationToken)
    {
        var issue = await LoadVisibleAsync(id, cancellationToken);
        if (!CanResolveOwnHandover(issue))
            throw new AppException("Only the reporting Staff member can resolve this handover issue.", 403, "issue_own_handover_required");

        await using var subjectLock = await handoverVerifier.LockSubjectAsync(
            issue.JobId!.Value, issue.ContainerId!.Value, issue.JobStepId, cancellationToken);
        await VerifyHandoverBarcodeAsync(issue, request.ScannedBarcode, cancellationToken);
        // Found and scanned: a container this issue held is back in use.
        string? outcomeNote = null;
        if (await HeldContainerAsync(issue, cancellationToken) is { } held)
        {
            await containerHolds!.ReleaseAsync(
                new ContainerReleaseRequest(held.ContainerId, issue.Id, ContainerHoldOutcomes.Found, null, currentUser.AccountId, request.Resolution),
                cancellationToken);
            outcomeNote = $"Container {held.Barcode}: {ContainerHoldOutcomes.Found}";
        }

        return await TransitionCoreAsync(issue, IssueStatus.RESOLVED, request.ExpectedVersion, request.Resolution,
            request.ScannedBarcode, cancellationToken, outcomeNote, outcomeNote is null ? null : ContainerHoldOutcomes.Found);
    }

    private async Task VerifyHandoverBarcodeAsync(IssueReport issue, string? barcode, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(barcode) || issue.ContainerId is not { } container
            || !await handoverVerifier.BarcodeMatchesAsync(container, barcode, cancellationToken))
            throw new DomainValidationException("Scan the expected container to verify the correction.", "issue_handover_barcode_mismatch");
    }

    private async Task<IssueDto> TransitionCoreAsync(
        IssueReport issue, IssueStatus to, int expectedVersion, string? resolution, string? scannedBarcode, CancellationToken cancellationToken,
        string? containerOutcomeNote = null, string? containerOutcome = null)
    {
        if (!IssueLifecycle.CanMove(issue.Status, to))
        {
            throw new ConflictException(
                $"An issue cannot go from {issue.Status} to {to}.",
                "issue_transition_not_allowed");
        }

        var now = clock.GetUtcNow();
        var update = Builders<IssueReport>.Update.Set(i => i.Status, to);
        update = to == IssueStatus.RESOLVED
            ? update.Set(i => i.ResolvedAt, now).Set(i => i.ResolvedBy, currentUser.AccountId).Set(i => i.Resolution, resolution!.Trim())
            : to == IssueStatus.IN_PROGRESS && issue.Status == IssueStatus.RESOLVED
                // Reopened: the earlier resolution no longer holds.
                ? update.Set(i => i.ResolvedAt, null).Set(i => i.ResolvedBy, null)
                : update;

        if (to == IssueStatus.RESOLVED && !string.IsNullOrWhiteSpace(scannedBarcode) && issue.ProblemCode is not null)
            update = update.Push(i => i.Evidence, ToEvidence(new EvidenceInput("NOTE", null, null,
                $"Verified container barcode: {scannedBarcode.Trim()}"), currentUser.AccountId, now));
        if (containerOutcome is not null)
            update = update.Set(i => i.ContainerOutcome, containerOutcome);
        if (containerOutcomeNote is not null)
            update = update.Push(i => i.Evidence, ToEvidence(new EvidenceInput("NOTE", null, null, containerOutcomeNote), currentUser.AccountId, now));

        var updated = await SaveAsync(issue, expectedVersion, update, cancellationToken);

        await audit.RecordAsync(
            new AuditEntry("issue.status_changed", Entity, issue.Id,
                Before: new Dictionary<string, object?> { ["status"] = issue.Status.ToString() },
                After: new Dictionary<string, object?> { ["status"] = to.ToString(), ["resolution"] = updated.Resolution }),
            cancellationToken);

        if (to is IssueStatus.RESOLVED or IssueStatus.CLOSED)
        {
            await notifications.ResolveAsync($"issue:{issue.Id}:open", cancellationToken);
            if (to == IssueStatus.RESOLVED && issue.ReportedBy != Guid.Empty && issue.ReportedBy != currentUser.AccountId)
            {
                await notifications.PublishAsync(
                    new NotificationDraft(
                        NotificationType.INFO,
                        "ISSUE_RESOLVED",
                        $"Issue {updated.Code} you reported was resolved",
                        Shorten(updated.Resolution ?? string.Empty),
                        Entity,
                        issue.Id,
                        Audience: NotificationAudience.Person(issue.ReportedBy)),
                    cancellationToken);
            }
        }

        return Project(updated);
    }

    public async Task<IssueDto> AddEvidenceAsync(Guid id, AddEvidenceRequest request, CancellationToken cancellationToken)
    {
        var issue = await LoadVisibleAsync(id, cancellationToken);
        if (issue.Status == IssueStatus.CLOSED)
        {
            throw new ConflictException("A closed issue takes no more evidence.", "issue_closed");
        }

        if (issue.Evidence.Count >= CreateIssueValidator.MaxEvidence * 2)
        {
            throw new DomainValidationException("This issue already has the maximum amount of evidence.", "issue_evidence_limit");
        }

        var me = currentUser.AccountId;
        var updated = await SaveAsync(
            issue,
            request.ExpectedVersion,
            Builders<IssueReport>.Update.Push(i => i.Evidence, ToEvidence(request.Evidence, me, clock.GetUtcNow())),
            cancellationToken);

        await audit.RecordAsync(
            new AuditEntry("issue.evidence_added", Entity, id,
                After: new Dictionary<string, object?> { ["kind"] = request.Evidence.Kind, ["uri"] = request.Evidence.Uri }),
            cancellationToken);
        return Project(updated);
    }

    // ------------------------------------------------------------------ helpers

    private IssueDto Project(IssueReport issue) => Project(issue, null);

    private IssueDto Project(IssueReport issue, ContainerHoldSnapshot? container)
    {
        var allowed = IssueLifecycle.NextOf(issue.Status);
        var user = httpContextAccessor.HttpContext?.User ?? new ClaimsPrincipal();
        if (!RolePermissionMatrix.UserHas(user, Permissions.IssueManage))
            allowed = CanResolveOwnHandover(issue) ? allowed.Where(status => status == IssueStatus.RESOLVED).ToList() : [];
        else if (HandoverProblemCodes.Blocking.Contains(issue.ProblemCode) && issue.Status != IssueStatus.RESOLVED)
            allowed = allowed.Where(status => status != IssueStatus.CLOSED).ToList();
        return IssueDto.From(issue, allowed.Select(status => status.ToString()).ToList(), container);
    }

    private bool CanResolveOwnHandover(IssueReport issue) =>
        currentUser.Role == AppRoles.Staff && currentUser.AccountId == issue.ReportedBy
        && issue.JobId is not null && issue.ContainerId is not null && HandoverProblemCodes.All.Contains(issue.ProblemCode);

    /// <summary>Applies <paramref name="update"/> only if nobody changed the issue since <paramref name="expectedVersion"/>.</summary>
    private async Task<IssueReport> SaveAsync(
        IssueReport issue,
        int expectedVersion,
        UpdateDefinition<IssueReport> update,
        CancellationToken cancellationToken)
    {
        if (expectedVersion != issue.Version)
        {
            throw new ConflictException("The issue was changed by someone else; reload it.", "issue_version_conflict");
        }

        var saved = await mongo.IssueReports.FindOneAndUpdateAsync(
            Builders<IssueReport>.Filter.And(
                Builders<IssueReport>.Filter.Eq(i => i.Id, issue.Id),
                Builders<IssueReport>.Filter.Eq(i => i.Version, expectedVersion)),
            update.Inc(i => i.Version, 1).Set(i => i.UpdatedAt, clock.GetUtcNow()),
            new FindOneAndUpdateOptions<IssueReport>
            {
                ReturnDocument = ReturnDocument.After,
                Projection = WithoutPhotoBytes
            },
            cancellationToken);

        return saved ?? throw new ConflictException("The issue was changed by someone else; reload it.", "issue_version_conflict");
    }

    private async Task<IssueReport> LoadVisibleAsync(Guid id, CancellationToken cancellationToken)
    {
        var filter = Builders<IssueReport>.Filter.And(
            Builders<IssueReport>.Filter.Eq(i => i.Id, id),
            await VisibleFilterAsync(cancellationToken));
        return await mongo.IssueReports.Find(filter).Project<IssueReport>(WithoutPhotoBytes).FirstOrDefaultAsync(cancellationToken)
            ?? throw NotFound();
    }

    private async Task<FilterDefinition<IssueReport>> VisibleFilterAsync(CancellationToken cancellationToken)
    {
        var f = Builders<IssueReport>.Filter;
        var user = httpContextAccessor.HttpContext?.User ?? new ClaimsPrincipal();
        var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
        var me = currentUser.AccountId ?? Guid.Empty;

        if (RolePermissionMatrix.UserHas(user, Permissions.IssueManage) && scope.AllRobots)
        {
            return f.Empty;
        }

        var mine = f.Or(f.Eq(i => i.ReportedBy, me), f.Eq(i => i.AssigneeId, me));
        if (currentUser.Role == AppRoles.Staff)
        {
            var warehouse = await staffWarehouse.GetOperatingWarehouseIdAsync(cancellationToken);
            var ordinary = mine & f.Eq(i => i.Hazard, null);
            return warehouse is { } id ? ordinary | f.Eq(i => i.Hazard!.WarehouseId, id) : ordinary;
        }
        if (!RolePermissionMatrix.UserHas(user, Permissions.IssueManage))
        {
            return mine;
        }

        var robots = scope.RobotIds.Cast<Guid?>().ToList();
        var warehouses = await robotLookup.GetWarehousesAsync(scope.RobotIds, cancellationToken);
        return f.Or(mine & f.Eq(i => i.Hazard, null), f.In(i => i.RobotId, robots), f.In(i => i.Hazard!.WarehouseId, warehouses));
    }

    private static IssueReport NewIssue(Guid reportedBy, DateTimeOffset now)
    {
        var id = Guid.NewGuid();
        return new IssueReport
        {
            Id = id,
            Code = "ISS-" + id.ToString("N")[..8].ToUpperInvariant(),
            ReportedBy = reportedBy,
            Status = IssueStatus.OPEN,
            ReportedAt = now,
            UpdatedAt = now,
            Version = 1
        };
    }

    private static EvidenceItem ToEvidence(EvidenceInput input, Guid? by, DateTimeOffset at) => new()
    {
        Kind = input.Kind,
        Uri = string.IsNullOrWhiteSpace(input.Uri) ? null : input.Uri.Trim(),
        MimeType = input.MimeType,
        Note = string.IsNullOrWhiteSpace(input.Note) ? null : input.Note.Trim(),
        AddedBy = by,
        AddedAt = at
    };

    private static Dictionary<string, object?> Snapshot(IssueReport i) => new()
    {
        ["code"] = i.Code,
        ["type"] = i.IssueType.ToString(),
        ["problemCode"] = i.ProblemCode,
        ["hazardLocation"] = i.Hazard?.LocationCode,
        ["severity"] = i.Severity.ToString(),
        ["status"] = i.Status.ToString(),
        ["jobId"] = i.JobId,
        ["robotId"] = i.RobotId,
        ["containerId"] = i.ContainerId,
        ["sourceKey"] = i.SourceKey
    };

    private static string Shorten(string text) => text.Length <= 160 ? text : text[..157] + "…";

    private static TEnum? TryParse<TEnum>(string? value) where TEnum : struct, Enum =>
        Enum.TryParse<TEnum>(value, ignoreCase: false, out var parsed) ? parsed : null;
}
