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
    int Take);

/// <summary>
/// IssueReport lifecycle (OPS-01). Who sees what:
/// Admin all issues; Technician the ones they reported, are assigned to, or that concern a robot in their scope;
/// Staff the ones they reported or are assigned to. An issue outside that set is "not found".
/// </summary>
public sealed class IssueService(
    OperationsMongoContext mongo,
    ICurrentUser currentUser,
    IHttpContextAccessor httpContextAccessor,
    IRobotAccessScope robotAccessScope,
    INotificationService notifications,
    IAuditTrail audit,
    TimeProvider clock) : IIssueReporter
{
    public const int MaxTake = 100;
    private const string Entity = "ISSUE";

    private static NotFoundException NotFound() => new("The issue was not found.", "issue_not_found");

    // ------------------------------------------------------------------ create

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
        issue.Evidence = (request.Evidence ?? []).Select(e => ToEvidence(e, me, now)).ToList();

        await mongo.IssueReports.InsertOneAsync(issue, cancellationToken: cancellationToken);
        await AfterCreatedAsync(issue, cancellationToken);
        return IssueDto.From(issue);
    }

    /// <summary>WFX-05: a HUMAN REPORT_ISSUE step. Idempotent on the step, so a retried confirmation reuses the issue.</summary>
    public async Task<Guid> ReportFromStepAsync(StepIssueDraft draft, CancellationToken cancellationToken = default)
    {
        var sourceKey = $"step:{draft.JobStepId}";
        var existing = await mongo.IssueReports.Find(i => i.SourceKey == sourceKey).Project(i => i.Id).FirstOrDefaultAsync(cancellationToken);
        if (existing != Guid.Empty)
        {
            return existing;
        }

        var now = clock.GetUtcNow();
        var issue = NewIssue(draft.ReportedBy ?? Guid.Empty, now);
        issue.IssueType = draft.RobotId is null ? IssueType.JOB : IssueType.ROBOT;
        issue.Severity = IssueSeverity.MEDIUM;
        issue.Description = draft.Description;
        issue.JobId = draft.JobId;
        issue.JobStepId = draft.JobStepId;
        issue.RobotId = draft.RobotId;
        issue.ContainerId = draft.ContainerId;
        issue.SourceKey = sourceKey;
        issue.Metadata = new MongoDB.Bson.BsonDocument { ["jobNo"] = draft.JobNo, ["stepKey"] = draft.StepKey };

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
        var f = Builders<IssueReport>.Filter;
        var filters = new List<FilterDefinition<IssueReport>> { await VisibleFilterAsync(cancellationToken) };

        if (TryParse<IssueStatus>(query.Status) is { } status) filters.Add(f.Eq(i => i.Status, status));
        if (TryParse<IssueType>(query.IssueType) is { } type) filters.Add(f.Eq(i => i.IssueType, type));
        if (TryParse<IssueSeverity>(query.Severity) is { } severity) filters.Add(f.Eq(i => i.Severity, severity));
        if (query.AssigneeId is { } assignee) filters.Add(f.Eq(i => i.AssigneeId, assignee));
        if (query.JobId is { } jobId) filters.Add(f.Eq(i => i.JobId, jobId));
        if (query.RobotId is { } robotId) filters.Add(f.Eq(i => i.RobotId, robotId));
        if (query.Mine && currentUser.AccountId is { } me) filters.Add(f.Or(f.Eq(i => i.ReportedBy, me), f.Eq(i => i.AssigneeId, me)));

        var filter = f.And(filters);
        var total = await mongo.IssueReports.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var items = await mongo.IssueReports.Find(filter)
            .SortByDescending(i => i.ReportedAt)
            .Skip(Math.Max(0, query.Skip))
            .Limit(Math.Clamp(query.Take, 1, MaxTake))
            .ToListAsync(cancellationToken);
        return new ListIssuesResponse(total, items.Select(IssueDto.From).ToList());
    }

    public async Task<IssueDto> GetAsync(Guid id, CancellationToken cancellationToken) =>
        IssueDto.From(await LoadVisibleAsync(id, cancellationToken));

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

        return IssueDto.From(updated);
    }

    public async Task<IssueDto> TransitionAsync(Guid id, TransitionIssueRequest request, CancellationToken cancellationToken)
    {
        var issue = await LoadVisibleAsync(id, cancellationToken);
        var to = Enum.Parse<IssueStatus>(request.Status);
        if (!IssueLifecycle.CanMove(issue.Status, to))
        {
            throw new ConflictException(
                $"An issue cannot go from {issue.Status} to {to}.",
                "issue_transition_not_allowed");
        }

        var now = clock.GetUtcNow();
        var update = Builders<IssueReport>.Update.Set(i => i.Status, to);
        update = to == IssueStatus.RESOLVED
            ? update.Set(i => i.ResolvedAt, now).Set(i => i.ResolvedBy, currentUser.AccountId).Set(i => i.Resolution, request.Resolution!.Trim())
            : to == IssueStatus.IN_PROGRESS && issue.Status == IssueStatus.RESOLVED
                // Reopened: the earlier resolution no longer holds.
                ? update.Set(i => i.ResolvedAt, null).Set(i => i.ResolvedBy, null)
                : update;

        var updated = await SaveAsync(issue, request.ExpectedVersion, update, cancellationToken);

        await audit.RecordAsync(
            new AuditEntry("issue.status_changed", Entity, id,
                Before: new Dictionary<string, object?> { ["status"] = issue.Status.ToString() },
                After: new Dictionary<string, object?> { ["status"] = to.ToString(), ["resolution"] = updated.Resolution }),
            cancellationToken);

        if (to is IssueStatus.RESOLVED or IssueStatus.CLOSED)
        {
            await notifications.ResolveAsync($"issue:{id}:open", cancellationToken);
            if (to == IssueStatus.RESOLVED && issue.ReportedBy != Guid.Empty && issue.ReportedBy != currentUser.AccountId)
            {
                await notifications.PublishAsync(
                    new NotificationDraft(
                        NotificationType.INFO,
                        "ISSUE_RESOLVED",
                        $"Issue {updated.Code} you reported was resolved",
                        Shorten(updated.Resolution ?? string.Empty),
                        Entity,
                        id,
                        Audience: NotificationAudience.Person(issue.ReportedBy)),
                    cancellationToken);
            }
        }

        return IssueDto.From(updated);
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
        return IssueDto.From(updated);
    }

    // ------------------------------------------------------------------ helpers

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
            new FindOneAndUpdateOptions<IssueReport> { ReturnDocument = ReturnDocument.After },
            cancellationToken);

        return saved ?? throw new ConflictException("The issue was changed by someone else; reload it.", "issue_version_conflict");
    }

    private async Task<IssueReport> LoadVisibleAsync(Guid id, CancellationToken cancellationToken)
    {
        var filter = Builders<IssueReport>.Filter.And(
            Builders<IssueReport>.Filter.Eq(i => i.Id, id),
            await VisibleFilterAsync(cancellationToken));
        return await mongo.IssueReports.Find(filter).FirstOrDefaultAsync(cancellationToken) ?? throw NotFound();
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
        if (!RolePermissionMatrix.UserHas(user, Permissions.IssueManage))
        {
            return mine;
        }

        var robots = scope.RobotIds.Cast<Guid?>().ToList();
        return f.Or(mine, f.In(i => i.RobotId, robots));
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
