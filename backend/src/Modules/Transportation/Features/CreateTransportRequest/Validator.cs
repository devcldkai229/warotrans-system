using FluentValidation;

namespace WaroTrans.Transportation.Features.CreateTransportRequest;

public sealed class CreateTransportRequestValidator : AbstractValidator<CreateTransportRequestRequest>
{
    // Movement data belongs to Details, never to WorkflowInputs.
    private static readonly string[] ReservedInputKeys = ["containerId", "source", "destination", "details"];

    public CreateTransportRequestValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty().WithMessage("WarehouseId is required.");
        RuleFor(x => x.MapVersionId).NotEmpty().WithMessage("MapVersionId is required.");
        RuleFor(x => x.WorkflowId).NotEmpty().WithMessage("WorkflowId is required.");

        RuleFor(x => x.Note)
            .MaximumLength(500)
            .WithMessage("Note must not exceed 500 characters.");

        RuleFor(x => x.WorkflowInputs)
            .Must(inputs => inputs is null || !inputs.Keys.Any(IsReservedKey))
            .WithMessage("WorkflowInputs must not contain movement keys (containerId, source, destination, details); send them as Details.");

        RuleFor(x => x.Details)
            .NotEmpty()
            .WithMessage("At least one Detail is required.");

        RuleFor(x => x.Details!)
            .Must(details => details.Select(d => d.SequenceNo).Distinct().Count() == details.Count)
            .WithMessage("Detail SequenceNo must be unique within the request.")
            .Must(details => details.Select(d => d.ContainerId).Distinct().Count() == details.Count)
            .WithMessage("A Container may appear in only one Detail of the request.")
            .When(x => x.Details is { Count: > 0 });

        RuleForEach(x => x.Details).ChildRules(detail =>
        {
            detail.RuleFor(d => d.SequenceNo).GreaterThan(0).WithMessage("SequenceNo must be greater than 0.");
            detail.RuleFor(d => d.ContainerId).NotEmpty().WithMessage("ContainerId is required.");
            detail.RuleFor(d => d.SourceEndpointId).NotEmpty().WithMessage("SourceEndpointId is required.");
            detail.RuleFor(d => d.DestinationEndpointId).NotEmpty().WithMessage("DestinationEndpointId is required.");
            detail.RuleFor(d => d.SourceLevelNo)
                .GreaterThanOrEqualTo((short)1)
                .When(d => d.SourceLevelNo.HasValue)
                .WithMessage("SourceLevelNo must be greater than or equal to 1.");
            detail.RuleFor(d => d.DestinationLevelNo)
                .GreaterThanOrEqualTo((short)1)
                .When(d => d.DestinationLevelNo.HasValue)
                .WithMessage("DestinationLevelNo must be greater than or equal to 1.");
        });
    }

    private static bool IsReservedKey(string key) =>
        ReservedInputKeys.Any(reserved =>
            key.Equals(reserved, StringComparison.OrdinalIgnoreCase)
            || key.StartsWith(reserved + ".", StringComparison.OrdinalIgnoreCase));
}
