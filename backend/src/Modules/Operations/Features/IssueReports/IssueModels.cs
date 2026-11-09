using FluentValidation;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Features.IssueReports;

public sealed record EvidenceInput(string Kind, string? Uri, string? MimeType, string? Note);

/// <param name="RobotId">Set for a robot problem: Admins and the Technicians of that robot are notified.</param>
public sealed record CreateIssueRequest(
    string IssueType,
    string Severity,
    string Description,
    Guid? ContainerId = null,
    Guid? TransportRequestId = null,
    Guid? JobId = null,
    Guid? JobStepId = null,
    Guid? StorageLocationId = null,
    Guid? RobotId = null,
    IReadOnlyList<EvidenceInput>? Evidence = null);

/// <param name="ExpectedVersion">The version the caller looked at; a newer one answers 409 issue_version_conflict.</param>
public sealed record AssignIssueRequest(Guid? AssigneeId, int ExpectedVersion);

public sealed record TransitionIssueRequest(string Status, int ExpectedVersion, string? Resolution = null);

public sealed record AddEvidenceRequest(EvidenceInput Evidence, int ExpectedVersion);

public sealed record EvidenceDto(string Kind, string? Uri, string? MimeType, string? Note, Guid? AddedBy, DateTimeOffset? AddedAt);

public sealed record IssueDto(
    Guid Id,
    string Code,
    string IssueType,
    string Severity,
    string Status,
    string Description,
    Guid ReportedBy,
    Guid? AssigneeId,
    Guid? ContainerId,
    Guid? TransportRequestId,
    Guid? JobId,
    Guid? JobStepId,
    Guid? StorageLocationId,
    Guid? RobotId,
    IReadOnlyList<EvidenceDto> Evidence,
    int Version,
    DateTimeOffset ReportedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ResolvedAt,
    Guid? ResolvedBy,
    string? Resolution,
    IReadOnlyList<string> AllowedTransitions)
{
    public static IssueDto From(IssueReport i) => new(
        i.Id,
        i.Code,
        i.IssueType.ToString(),
        i.Severity.ToString(),
        i.Status.ToString(),
        i.Description,
        i.ReportedBy,
        i.AssigneeId,
        i.ContainerId,
        i.TransportRequestId,
        i.JobId,
        i.JobStepId,
        i.StorageLocationId,
        i.RobotId,
        i.Evidence.Select(e => new EvidenceDto(e.Kind, e.Uri, e.MimeType, e.Note, e.AddedBy, e.AddedAt)).ToList(),
        i.Version,
        i.ReportedAt,
        i.UpdatedAt,
        i.ResolvedAt,
        i.ResolvedBy,
        i.Resolution,
        IssueLifecycle.NextOf(i.Status).Select(s => s.ToString()).ToList());
}

public sealed record ListIssuesResponse(long Total, IReadOnlyList<IssueDto> Items);

/// <summary>Allowed status changes. RESOLVED can be reopened; CLOSED is final.</summary>
public static class IssueLifecycle
{
    private static readonly Dictionary<IssueStatus, IssueStatus[]> Next = new()
    {
        [IssueStatus.OPEN] = [IssueStatus.ACKNOWLEDGED, IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED, IssueStatus.CLOSED],
        [IssueStatus.ACKNOWLEDGED] = [IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED, IssueStatus.CLOSED],
        [IssueStatus.IN_PROGRESS] = [IssueStatus.RESOLVED, IssueStatus.CLOSED],
        [IssueStatus.RESOLVED] = [IssueStatus.IN_PROGRESS, IssueStatus.CLOSED],
        [IssueStatus.CLOSED] = []
    };

    public static IReadOnlyList<IssueStatus> NextOf(IssueStatus status) => Next.GetValueOrDefault(status, []);

    public static bool CanMove(IssueStatus from, IssueStatus to) => NextOf(from).Contains(to);
}

public static class EvidenceKinds
{
    public static readonly string[] All = ["PHOTO", "VIDEO", "NOTE", "LINK", "FILE"];
}

internal sealed class EvidenceInputValidator : AbstractValidator<EvidenceInput>
{
    public EvidenceInputValidator()
    {
        RuleFor(x => x.Kind).Must(k => EvidenceKinds.All.Contains(k)).WithMessage("Evidence kind must be PHOTO, VIDEO, NOTE, LINK or FILE.");
        RuleFor(x => x.Uri).MaximumLength(1000);
        RuleFor(x => x.MimeType).MaximumLength(100);
        RuleFor(x => x.Note).MaximumLength(1000);
        RuleFor(x => x).Must(x => !string.IsNullOrWhiteSpace(x.Uri) || !string.IsNullOrWhiteSpace(x.Note))
            .WithMessage("Evidence needs a URI or a note.");
    }
}

internal sealed class CreateIssueValidator : AbstractValidator<CreateIssueRequest>
{
    public const int MaxEvidence = 10;

    public CreateIssueValidator()
    {
        RuleFor(x => x.IssueType).Must(v => Enum.TryParse<IssueType>(v, false, out _))
            .WithMessage("IssueType must be CONTAINER, TRANSPORT, JOB, ROBOT, STORAGE or OTHER.");
        RuleFor(x => x.Severity).Must(v => Enum.TryParse<IssueSeverity>(v, false, out _))
            .WithMessage("Severity must be LOW, MEDIUM, HIGH or CRITICAL.");
        RuleFor(x => x.Description).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.Evidence!.Count).LessThanOrEqualTo(MaxEvidence).When(x => x.Evidence is not null);
        RuleForEach(x => x.Evidence).SetValidator(new EvidenceInputValidator());
        RuleFor(x => x.RobotId).NotNull().When(x => x.IssueType == nameof(Enums.IssueType.ROBOT))
            .WithMessage("A ROBOT issue must name the robot.");
    }
}

internal sealed class TransitionIssueValidator : AbstractValidator<TransitionIssueRequest>
{
    public TransitionIssueValidator()
    {
        RuleFor(x => x.Status).Must(v => Enum.TryParse<IssueStatus>(v, false, out _)).WithMessage("Unknown status.");
        RuleFor(x => x.Resolution).NotEmpty().MaximumLength(2000)
            .When(x => x.Status == nameof(IssueStatus.RESOLVED))
            .WithMessage("Resolving an issue needs a resolution.");
    }
}

internal sealed class AddEvidenceValidator : AbstractValidator<AddEvidenceRequest>
{
    public AddEvidenceValidator()
    {
        RuleFor(x => x.Evidence).NotNull().SetValidator(new EvidenceInputValidator());
    }
}
