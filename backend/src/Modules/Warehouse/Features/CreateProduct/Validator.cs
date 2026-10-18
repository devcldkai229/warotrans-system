using FluentValidation;

namespace WaroTrans.Warehouse.Features.CreateProduct;

public sealed class CreateProductValidator : AbstractValidator<CreateProductRequest>
{
    public CreateProductValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty().WithMessage("CategoryId is required.");

        RuleFor(x => x.Sku)
            .NotEmpty().WithMessage("SKU is required.")
            .MaximumLength(100).WithMessage("SKU must not exceed 100 characters.");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(200).WithMessage("Name must not exceed 200 characters.");

        RuleFor(x => x.SupplierBarcode)
            .MaximumLength(128).WithMessage("Supplier barcode must not exceed 128 characters.")
            .When(x => x.SupplierBarcode is not null);

        RuleFor(x => x.Description)
            .MaximumLength(500).WithMessage("Description must not exceed 500 characters.")
            .When(x => x.Description is not null);
    }
}
