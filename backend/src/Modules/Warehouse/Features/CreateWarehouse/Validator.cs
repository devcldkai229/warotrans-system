using FluentValidation;

namespace WaroTrans.Warehouse.Features.CreateWarehouse;

public sealed class CreateWarehouseValidator : AbstractValidator<CreateWarehouseRequest>
{
    public CreateWarehouseValidator()
    {
        RuleFor(x => x.Code)
            .NotEmpty().WithMessage("Code is required.")
            .MaximumLength(100).WithMessage("Code must not exceed 100 characters.");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(500).WithMessage("Name must not exceed 500 characters.");

        RuleFor(x => x.Address)
            .MaximumLength(500)
            .When(x => x.Address is not null);

        RuleFor(x => x.Timezone)
            .MaximumLength(50)
            .When(x => x.Timezone is not null);
    }
}
