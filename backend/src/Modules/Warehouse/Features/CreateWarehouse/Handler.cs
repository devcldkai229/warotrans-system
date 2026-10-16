using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateWarehouse;

public sealed class CreateWarehouseHandler(
    WarehouseDbContext dbContext,
    IValidator<CreateWarehouseRequest> validator)
{
    public async Task<CreateWarehouseResponse> HandleAsync(
        CreateWarehouseRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var code = request.Code.Trim().ToUpperInvariant();
        var name = request.Name.Trim();
        var timezone = string.IsNullOrWhiteSpace(request.Timezone)
            ? "Asia/Ho_Chi_Minh"
            : request.Timezone.Trim();
        var address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
        var isActive = request.IsActive ?? true;

        var codeTaken = await dbContext.Warehouses
            .AnyAsync(w => w.Code == code, cancellationToken);
        if (codeTaken)
        {
            throw new ConflictException(
                $"Warehouse code '{code}' already exists.",
                "warehouse_code_taken");
        }

        var warehouse = new Entities.Warehouse
        {
            Id = Guid.NewGuid(),
            Code = code,
            Name = name,
            Address = address,
            Timezone = timezone,
            IsActive = isActive,
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.Warehouses.Add(warehouse);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new CreateWarehouseResponse(
            warehouse.Id,
            warehouse.Code,
            warehouse.Name,
            warehouse.Address,
            warehouse.Timezone,
            warehouse.IsActive,
            warehouse.CreatedAt);
    }
}
