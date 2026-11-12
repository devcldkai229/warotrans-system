using FluentValidation;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Features.ListContainers;

public sealed class ListContainersRequestValidator : AbstractValidator<ListContainersRequest>
{
    public ListContainersRequestValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty().WithMessage("WarehouseId is required.");
        RuleFor(x => x.Take).InclusiveBetween(1, 500);
        RuleFor(x => x.Skip).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Search)
            .MaximumLength(100)
            .When(x => x.Search is not null);
        RuleFor(x => x.Status)
            .IsEnumName(typeof(ContainerStatus), caseSensitive: true)
            .When(x => !string.IsNullOrEmpty(x.Status))
            .WithMessage("Status must be a container status such as STORED.");
    }
}
