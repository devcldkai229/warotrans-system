using FluentValidation;

namespace WaroTrans.Warehouse.Features.CreateContainer;

public sealed class CreateContainerValidator : AbstractValidator<CreateContainerRequest>
{
    public CreateContainerValidator()
    {
        RuleFor(x => x.ProductId)
            .NotEmpty()
            .WithMessage("ProductId is required.");

        RuleFor(x => x.SupplierPackageBarcode)
            .MaximumLength(128)
            .WithMessage("SupplierPackageBarcode must not exceed 128 characters.");

        RuleFor(x => x.InitialLevelNo)
            .GreaterThan((short)0)
            .When(x => x.InitialLevelNo.HasValue)
            .WithMessage("InitialLevelNo must be greater than 0.");
    }
}
