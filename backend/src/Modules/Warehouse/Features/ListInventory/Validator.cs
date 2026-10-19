using FluentValidation;

namespace WaroTrans.Warehouse.Features.ListInventory;

public sealed class ListInventoryRequestValidator : AbstractValidator<ListInventoryRequest>
{
    public ListInventoryRequestValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty().WithMessage("WarehouseId is required.");
        RuleFor(x => x.Skip).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Take).InclusiveBetween(1, 500);
        RuleFor(x => x.Search)
            .MaximumLength(100)
            .When(x => x.Search is not null);
    }
}
