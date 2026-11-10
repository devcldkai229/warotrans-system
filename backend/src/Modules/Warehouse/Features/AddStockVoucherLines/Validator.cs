using FluentValidation;

namespace WaroTrans.Warehouse.Features.AddStockVoucherLines;

public sealed class AddStockVoucherLinesValidator : AbstractValidator<AddStockVoucherLinesRequest>
{
    public AddStockVoucherLinesValidator()
    {
        RuleFor(x => x)
            .Must(x => (x.ContainerIds is { Count: > 0 }) ^ x.ProductId.HasValue)
            .WithName("Request")
            .WithMessage("Send either ContainerIds or ProductId with Count, not both.");

        RuleFor(x => x.ContainerIds!)
            .Must(ids => ids.Count <= 200)
            .WithMessage("At most 200 Containers can be added at once.")
            .Must(ids => ids.All(id => id != Guid.Empty))
            .WithMessage("ContainerIds must not contain an empty id.")
            .Must(ids => ids.Distinct().Count() == ids.Count)
            .WithMessage("ContainerIds must be unique.")
            .When(x => x.ContainerIds is { Count: > 0 });

        RuleFor(x => x.ProductId!.Value)
            .NotEmpty()
            .WithMessage("ProductId must not be empty.")
            .When(x => x.ProductId.HasValue);

        RuleFor(x => x.Count)
            .NotNull()
            .WithMessage("Count is required with ProductId.")
            .InclusiveBetween(1, 200)
            .WithMessage("Count must be between 1 and 200.")
            .When(x => x.ProductId.HasValue);
    }
}
