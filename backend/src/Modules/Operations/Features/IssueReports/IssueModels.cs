using FluentValidation;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
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
    IReadOnlyList<EvidenceInput>? Evidence = null,
    string? ProblemCode = null);

/// <param name="ExpectedVersion">The version the caller looked at; a newer one answers 409 issue_version_conflict.</param>
public sealed record AssignIssueRequest(Guid? AssigneeId, int ExpectedVersion);

/// <param name="ContainerOutcome">Resolving an issue that holds a container: what becomes of it (<see cref="ContainerHoldOutcomes"/>).</param>
/// <param name="ContentsQuantity">The counted quantity, with <see cref="ContainerHoldOutcomes.AdjustQuantity"/>.</param>
public sealed record TransitionIssueRequest(
    string Status,
    int ExpectedVersion,
    string? Resolution = null,
    string? ScannedBarcode = null,
    string? ContainerOutcome = null,
    decimal? ContentsQuantity = null);

public sealed record ResolveOwnHandoverIssueRequest(int ExpectedVersion, string ScannedBarcode, string Resolution);

public sealed record CreateHazardRequest(
    Guid RequestId, Guid MapVersionId, string HazardType, string Severity, string Description,
    Guid? EdgeId = null, Guid? ZoneId = null, Guid? EndpointId = null);

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
    IReadOnlyList<string> AllowedTransitions,
    string? ProblemCode,
    HazardLocation? Hazard,
    bool BlocksHandover = false,
    IReadOnlyList<string>? Defects = null,
    bool RemovedFromJob = false,
    ContainerHoldSnapshot? ContainerHold = null,
    IReadOnlyList<string>? ContainerOutcomes = null,
    string? ContainerOutcome = null)
{
    public static IssueDto From(IssueReport i, IReadOnlyList<string> transitions, ContainerHoldSnapshot? hold = null) => new(
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
        transitions,
        i.ProblemCode,
        i.Hazard,
        // A container taken off its Job has no handover left to block.
        HandoverProblemCodes.Blocking.Contains(i.ProblemCode) && IssueLifecycle.IsOpen(i.Status)
            && !(i.Metadata.TryGetValue("removedFromJob", out var gone) && gone.IsBoolean && gone.AsBoolean),
        i.Metadata.TryGetValue("defects", out var defects) && defects.IsBsonArray
            ? defects.AsBsonArray.Select(d => d.AsString).ToList()
            : i.ProblemCode is null ? [] : [i.ProblemCode],
        i.Metadata.TryGetValue("removedFromJob", out var removed) && removed.IsBoolean && removed.AsBoolean,
        hold,
        // What resolving it may do with the container it holds: chosen by the problem.
        i.IssueType == Enums.IssueType.CONTAINER ? ContainerProblemCodes.OutcomesFor(i.ProblemCode) : [],
        i.ContainerOutcome);
}

/// <param name="CountsByType">Issues per type under every other filter (status, severity, reported range), for the type tabs.
/// Every type is present, with 0 when it has none.</param>
public sealed record ListIssuesResponse(long Total, IReadOnlyList<IssueDto> Items, IReadOnlyDictionary<string, long>? CountsByType = null);

/// <summary>Rules of the issue list filters that do not need the database.</summary>
public static class IssueListFilters
{
    /// <summary>The reported range is [from, to): <paramref name="to"/> itself is not included.</summary>
    public static void EnsureReportedRange(DateTimeOffset? from, DateTimeOffset? to)
    {
        if (from is { } start && to is { } end && end <= start)
            throw new DomainValidationException("The end of the reported range must be after its start.", "issue_reported_range_invalid");
    }

    /// <summary>One entry per <see cref="IssueType"/>, in enum order, 0 for a type without issues.</summary>
    public static IReadOnlyDictionary<string, long> CountsByType(IEnumerable<KeyValuePair<IssueType, long>> counts)
    {
        var found = counts.GroupBy(c => c.Key).ToDictionary(g => g.Key, g => g.Sum(c => c.Value));
        return Enum.GetValues<IssueType>().ToDictionary(type => type.ToString(), type => found.GetValueOrDefault(type));
    }
}

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

    /// <summary>Still to be dealt with: OPEN, ACKNOWLEDGED or IN_PROGRESS.</summary>
    public static bool IsOpen(IssueStatus status) => status is IssueStatus.OPEN or IssueStatus.ACKNOWLEDGED or IssueStatus.IN_PROGRESS;
}

public static class EvidenceKinds
{
    public static readonly string[] All = ["PHOTO", "VIDEO", "NOTE", "LINK", "FILE"];
}

/// <summary>The container problem codes (<see cref="ContainerProblemCodes"/>) as the issue rules use them.</summary>
internal static class HandoverProblemCodes
{
    public static readonly string[] Blocking = ContainerProblemCodes.Blocking.ToArray();
    public static readonly string[] All = ContainerProblemCodes.All.ToArray();
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
        RuleFor(x => x.ProblemCode).Must(code => HandoverProblemCodes.All.Contains(code))
            .When(x => x.ProblemCode is not null).WithMessage("Unknown handover problem code.");
        RuleFor(x => x).Must(x => x.IssueType == nameof(Enums.IssueType.CONTAINER)
                && x.JobId is not null && x.ContainerId is not null)
            .When(x => x.ProblemCode is not null).WithMessage("A handover problem must name the Job and expected container.");
    }
}

internal sealed class ResolveOwnHandoverIssueValidator : AbstractValidator<ResolveOwnHandoverIssueRequest>
{
    public ResolveOwnHandoverIssueValidator()
    {
        RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.ScannedBarcode).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Resolution).NotEmpty().MaximumLength(1000);
    }
}

internal sealed class CreateHazardValidator : AbstractValidator<CreateHazardRequest>
{
    private static readonly string[] HazardTypes = ["LIQUID_SPILL", "FALLEN_CARGO", "FACILITY_WORK", "FORKLIFT_TRAFFIC", "OTHER"];

    public CreateHazardValidator()
    {
        RuleFor(x => x.RequestId).NotEmpty();
        RuleFor(x => x.MapVersionId).NotEmpty();
        RuleFor(x => x.HazardType).Must(HazardTypes.Contains).WithMessage("Unknown hazard type.");
        RuleFor(x => x.Severity).Must(value => Enum.GetNames<IssueSeverity>().Contains(value)).WithMessage("Unknown severity.");
        RuleFor(x => x.Description).NotEmpty().MaximumLength(2000);
        RuleFor(x => x).Must(x => new[] { x.EdgeId, x.ZoneId, x.EndpointId }.OfType<Guid>().Count(id => id != Guid.Empty) == 1
                && new[] { x.EdgeId, x.ZoneId, x.EndpointId }.All(id => id != Guid.Empty))
            .WithMessage("Choose exactly one edge, work zone or endpoint of the map.");
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
        RuleFor(x => x.ScannedBarcode).MaximumLength(200);
        RuleFor(x => x.ContainerOutcome).Must(o => ContainerHoldOutcomes.All.Contains(o!))
            .When(x => x.ContainerOutcome is not null).WithMessage("Unknown container outcome.");
        RuleFor(x => x.ContentsQuantity).GreaterThan(0).When(x => x.ContentsQuantity is not null);
    }
}

internal sealed class AddEvidenceValidator : AbstractValidator<AddEvidenceRequest>
{
    public AddEvidenceValidator()
    {
        RuleFor(x => x.Evidence).NotNull().SetValidator(new EvidenceInputValidator());
    }
}
