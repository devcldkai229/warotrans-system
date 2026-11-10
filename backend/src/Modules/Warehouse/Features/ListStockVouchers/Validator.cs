using FluentValidation;

namespace WaroTrans.Warehouse.Features.ListStockVouchers;

public sealed class ListStockVouchersValidator : AbstractValidator<ListStockVouchersRequest>
{
    public ListStockVouchersValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty().WithMessage("WarehouseId is required.");
        RuleFor(x => x.Skip).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Take).InclusiveBetween(1, 200);
        RuleFor(x => x.Search)
            .MaximumLength(100)
            .When(x => x.Search is not null);
    }
}
