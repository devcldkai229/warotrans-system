using FluentValidation;

namespace WaroTrans.Navigation.Features.UpdateMapVersion;

public sealed class UpdateMapVersionValidator : AbstractValidator<UpdateMapVersionRequest>
{
    public UpdateMapVersionValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(500).WithMessage("Name must not exceed 500 characters.");

        RuleFor(x => x.MapUri)
            .NotEmpty().WithMessage("MapUri is required.")
            .MaximumLength(500).WithMessage("MapUri must not exceed 500 characters.");

        RuleFor(x => x.Resolution)
            .GreaterThan(0).WithMessage("Resolution must be greater than 0.");
    }
}
