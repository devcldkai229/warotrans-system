using FluentValidation;

namespace WaroTrans.Warehouse.Features.CreateStorageLocation;

public sealed class CreateStorageLocationValidator : AbstractValidator<CreateStorageLocationRequest>
{
    public CreateStorageLocationValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty().WithMessage("WarehouseId is required.");
        RuleFor(x => x.EndpointId).NotEmpty().WithMessage("EndpointId is required.");

        RuleFor(x => x.Code)
            .NotEmpty().WithMessage("Code is required.")
            .MaximumLength(100).WithMessage("Code must not exceed 100 characters.");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(100).WithMessage("Name must not exceed 100 characters.");
    }
}
