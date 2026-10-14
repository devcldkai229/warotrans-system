using FluentValidation;

namespace WaroTrans.Warehouse.Features.ListWarehouses;

public sealed class ListWarehousesRequestValidator : AbstractValidator<ListWarehousesRequest>
{
    public ListWarehousesRequestValidator()
    {
        RuleFor(x => x.Skip).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Take).InclusiveBetween(1, 100);
    }
}
