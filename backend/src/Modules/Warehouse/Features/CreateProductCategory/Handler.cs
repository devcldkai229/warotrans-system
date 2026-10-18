using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateProductCategory;

public sealed class CreateProductCategoryHandler(
    WarehouseDbContext dbContext,
    IValidator<CreateProductCategoryRequest> validator,
    ICurrentUser currentUser,
    ILogger<CreateProductCategoryHandler> logger)
{
    public async Task<ProductCategoryResponse> HandleAsync(
        CreateProductCategoryRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var code = request.Code.Trim().ToUpperInvariant();
        if (await dbContext.ProductCategories.AnyAsync(c => c.Code == code, cancellationToken))
        {
            throw CodeTaken(code);
        }

        var category = new ProductCategory
        {
            Id = Guid.NewGuid(),
            Code = code,
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim()
        };

        dbContext.ProductCategories.Add(category);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (UniqueViolation.ConstraintOf(exception) is not null)
        {
            throw CodeTaken(code);
        }

        logger.LogInformation("Product category {CategoryId} ({Code}) created by {AccountId}", category.Id, category.Code, currentUser.AccountId);
        return ProductCategoryResponse.From(category);
    }

    private static ConflictException CodeTaken(string code) =>
        new($"Product category code '{code}' already exists.", "product_category_code_taken");
}
