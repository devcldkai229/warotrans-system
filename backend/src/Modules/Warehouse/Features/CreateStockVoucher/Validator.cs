using FluentValidation;

namespace WaroTrans.Warehouse.Features.CreateStockVoucher;

public sealed class CreateStockVoucherValidator : AbstractValidator<CreateStockVoucherRequest>
{
    public CreateStockVoucherValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty().WithMessage("WarehouseId is required.");
        RuleFor(x => x.Type).IsInEnum().WithMessage("Type must be INBOUND or OUTBOUND.");

        RuleFor(x => x.ReferenceNo)
            .MaximumLength(100)
            .WithMessage("ReferenceNo must not exceed 100 characters.");

        RuleFor(x => x.Note)
            .MaximumLength(500)
            .WithMessage("Note must not exceed 500 characters.");
    }
}
