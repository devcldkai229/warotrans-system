using FluentValidation;

namespace WaroTrans.Warehouse.Features.ListContainers;

public sealed class ListContainersRequestValidator : AbstractValidator<ListContainersRequest>
{
    public ListContainersRequestValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty().WithMessage("WarehouseId is required.");
        RuleFor(x => x.Take).InclusiveBetween(1, 100);
        RuleFor(x => x.Search)
            .MaximumLength(100)
            .When(x => x.Search is not null);
    }
}
