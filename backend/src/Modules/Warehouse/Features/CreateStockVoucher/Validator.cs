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

        RuleFor(x => x.ContainerIds!)
            .Must(ids => ids.Count <= 200)
            .WithMessage("At most 200 Containers can be added at once.")
            .Must(ids => ids.All(id => id != Guid.Empty))
            .WithMessage("ContainerIds must not contain an empty id.")
            .Must(ids => ids.Distinct().Count() == ids.Count)
            .WithMessage("ContainerIds must be unique.")
            .When(x => x.ContainerIds is { Count: > 0 });

        RuleFor(x => x.ContainerIds)
            .Must(ids => ids is { Count: > 0 })
            .When(x => x.Confirm)
            .WithMessage("Select the Containers to confirm the voucher with.");
    }
}
