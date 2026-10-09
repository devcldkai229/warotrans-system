using FluentValidation;

namespace WaroTrans.Warehouse.Features.ResolveProduct;

public sealed class ResolveProductValidator : AbstractValidator<ResolveProductRequest>
{
    public ResolveProductValidator()
    {
        RuleFor(x => x)
            .Must(x => !string.IsNullOrWhiteSpace(x.Barcode) || !string.IsNullOrWhiteSpace(x.Query))
            .WithMessage("Either Barcode or Query must be provided.");

        RuleFor(x => x.Limit)
            .InclusiveBetween(1, 100)
            .WithMessage("Limit must be between 1 and 100.");
    }
}
