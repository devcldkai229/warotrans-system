using FluentValidation;

namespace WaroTrans.Navigation.Features.CreateMapVersion;

public sealed class CreateMapVersionValidator : AbstractValidator<CreateMapVersionRequest>
{
    public CreateMapVersionValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(500).WithMessage("Name must not exceed 500 characters.");

        RuleFor(x => x.MapUri)
            .MaximumLength(500).WithMessage("MapUri must not exceed 500 characters.")
            .When(x => x.MapUri is not null);

        RuleFor(x => x.MapYamlUri)
            .MaximumLength(500)
            .When(x => x.MapYamlUri is not null);

        RuleFor(x => x.PreviewImageUri)
            .MaximumLength(500)
            .When(x => x.PreviewImageUri is not null);

        RuleFor(x => x.Resolution)
            .GreaterThan(0).WithMessage("Resolution must be greater than 0.");
    }
}
