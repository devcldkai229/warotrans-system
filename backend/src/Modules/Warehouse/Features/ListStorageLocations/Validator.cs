using FluentValidation;

namespace WaroTrans.Warehouse.Features.ListStorageLocations;

public sealed class ListStorageLocationsRequestValidator : AbstractValidator<ListStorageLocationsRequest>
{
    public ListStorageLocationsRequestValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty().WithMessage("WarehouseId is required.");
    }
}
