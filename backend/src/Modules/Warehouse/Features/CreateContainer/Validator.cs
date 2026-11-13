using FluentValidation;

namespace WaroTrans.Warehouse.Features.CreateContainer;

public sealed class CreateContainerValidator : AbstractValidator<CreateContainerRequest>
{
    public const int MaxContainers = 9999;
    public const decimal MaxContentsQuantity = 999999999999999.999m;

    public CreateContainerValidator()
    {
        RuleFor(x => x).Custom((request, context) =>
        {
            if (request.Groups is null)
            {
                if (!request.ProductId.HasValue || request.ProductId == Guid.Empty)
                    context.AddFailure(nameof(request.ProductId), "ProductId is required.");
                if (request.SupplierPackageBarcode?.Length > 128)
                    context.AddFailure(nameof(request.SupplierPackageBarcode), "SupplierPackageBarcode must not exceed 128 characters.");
                if (request.InitialLevelNo is <= 0)
                    context.AddFailure(nameof(request.InitialLevelNo), "InitialLevelNo must be greater than 0.");
                if (request.WarehouseId.HasValue || request.RequestId.HasValue || request.ContainerCount.HasValue)
                    context.AddFailure(nameof(request.Groups), "Groups is required for batch receiving.");
                return;
            }

            if (request.ProductId.HasValue || request.SupplierPackageBarcode is not null || request.InitialLevelNo.HasValue || request.StockVoucherId.HasValue)
                context.AddFailure(nameof(request.Groups), "Do not mix batch groups with legacy single-Container fields. Create the voucher after receiving the batch.");
            if (!request.WarehouseId.HasValue || request.WarehouseId == Guid.Empty)
                context.AddFailure(nameof(request.WarehouseId), "WarehouseId is required for batch receiving.");
            if (!request.RequestId.HasValue || request.RequestId == Guid.Empty)
                context.AddFailure(nameof(request.RequestId), "RequestId is required and must be reused when retrying this batch.");
            if (request.ContainerCount is null or < 1 or > MaxContainers)
                context.AddFailure(nameof(request.ContainerCount), $"ContainerCount must be between 1 and {MaxContainers}.");
            if (request.InitialStorageLocationId == Guid.Empty)
                context.AddFailure(nameof(request.InitialStorageLocationId), "InitialStorageLocationId must be a non-empty UUID.");
            if (request.Groups.Count is < 1 or > MaxContainers)
            {
                context.AddFailure(nameof(request.Groups), $"Provide between 1 and {MaxContainers} groups.");
                return;
            }
            var total = request.Groups.Sum(group => (long)(group?.ContainerCount ?? 0));
            if (total != request.ContainerCount || total is < 1 or > MaxContainers)
                context.AddFailure(nameof(request.Groups), $"Group counts must equal ContainerCount, between 1 and {MaxContainers}.");

            var keys = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < request.Groups.Count; i++)
            {
                var prefix = $"Groups[{i}]";
                var group = request.Groups[i];
                if (group is null) { context.AddFailure(prefix, "A product group cannot be null."); continue; }
                if (string.IsNullOrWhiteSpace(group.GroupKey) || group.GroupKey.Trim().Length > 64 || !keys.Add(group.GroupKey.Trim()))
                    context.AddFailure($"{prefix}.GroupKey", "GroupKey must be unique, non-blank and at most 64 characters.");
                if (group.ProductId == Guid.Empty) context.AddFailure($"{prefix}.ProductId", "ProductId is required.");
                if (group.ContainerCount is < 1 or > MaxContainers)
                    context.AddFailure($"{prefix}.ContainerCount", $"ContainerCount must be between 1 and {MaxContainers}.");
                if (!ValidQuantity(group.QuantityPerContainer))
                    context.AddFailure($"{prefix}.QuantityPerContainer", "Quantity must be positive, at most 999999999999999.999, with at most 3 decimal places.");
                if (string.IsNullOrWhiteSpace(group.Unit) || group.Unit.Trim().Length > 32)
                    context.AddFailure($"{prefix}.Unit", "Unit is required and must not exceed 32 characters.");
                if (group.SupplierPackageBarcode?.Length > 128)
                    context.AddFailure($"{prefix}.SupplierPackageBarcode", "SupplierPackageBarcode must not exceed 128 characters.");
                if (group.QuantityOverrides is null) continue;
                if (group.QuantityOverrides.Count > Math.Clamp(group.ContainerCount, 0, MaxContainers))
                {
                    context.AddFailure($"{prefix}.QuantityOverrides", "There cannot be more overrides than containers.");
                    continue;
                }
                var numbers = new HashSet<int>();
                for (var j = 0; j < group.QuantityOverrides.Count; j++)
                {
                    var item = group.QuantityOverrides[j];
                    var path = $"{prefix}.QuantityOverrides[{j}]";
                    if (item is null) { context.AddFailure(path, "A quantity override cannot be null."); continue; }
                    if (item.ContainerNo < 1 || item.ContainerNo > group.ContainerCount || !numbers.Add(item.ContainerNo))
                        context.AddFailure($"{path}.ContainerNo", "ContainerNo must be unique and within this group's 1-based container range.");
                    if (!ValidQuantity(item.Quantity)) context.AddFailure($"{path}.Quantity", "Quantity must be positive with at most 3 decimal places and fit decimal(18,3).");
                }
            }
        });
    }

    private static bool ValidQuantity(decimal value) =>
        value > 0 && value <= MaxContentsQuantity && decimal.Round(value, 3) == value;
}
