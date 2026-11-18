using FluentValidation;

namespace WaroTrans.Warehouse.Features.AddStockVoucherLines;

public sealed class AddStockVoucherLinesValidator : AbstractValidator<AddStockVoucherLinesRequest>
{
    public AddStockVoucherLinesValidator()
    {
        RuleFor(x => x)
            .Must(x => x.ContainerIds is { Count: > 0 } && x.ProductId is null && x.Count is null)
            .WithName("ContainerIds")
            .WithMessage("Select ContainerIds explicitly. ProductId/Count picking is not supported on stock vouchers.");

        RuleFor(x => x.ContainerIds!)
            .Must(ids => ids.Count <= 200)
            .WithMessage("At most 200 Containers can be added at once.")
            .Must(ids => ids.All(id => id != Guid.Empty))
            .WithMessage("ContainerIds must not contain an empty id.")
            .Must(ids => ids.Distinct().Count() == ids.Count)
            .WithMessage("ContainerIds must be unique.")
            .When(x => x.ContainerIds is { Count: > 0 });

    }
}
