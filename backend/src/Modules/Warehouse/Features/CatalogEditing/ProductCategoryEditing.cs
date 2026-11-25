using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CatalogEditing;

/// <summary>Name and description of a category. The code is not editable.</summary>
public sealed record UpdateProductCategoryRequest(string Name, string? Description = null);

public sealed class UpdateProductCategoryValidator : AbstractValidator<UpdateProductCategoryRequest>
{
    public UpdateProductCategoryValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(100).WithMessage("Name must not exceed 100 characters.");
        RuleFor(x => x.Description)
            .MaximumLength(500).WithMessage("Description must not exceed 500 characters.")
            .When(x => x.Description is not null);
    }
}

public sealed class ProductCategoryEditingHandler(
    WarehouseDbContext dbContext,
    IValidator<UpdateProductCategoryRequest> validator,
    IAuditTrail auditTrail,
    ICurrentUser currentUser,
    ILogger<ProductCategoryEditingHandler> logger)
{
    public async Task<ProductCategoryResponse> UpdateAsync(Guid id, UpdateProductCategoryRequest request, CancellationToken cancellationToken = default)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        var category = await FindAsync(id, cancellationToken);

        var name = request.Name.Trim();
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        if (category.Name == name && category.Description == description)
        {
            return ProductCategoryResponse.From(category);
        }

        var before = new Dictionary<string, object?> { ["name"] = category.Name, ["description"] = category.Description };
        category.Name = name;
        category.Description = description;
        await dbContext.SaveChangesAsync(cancellationToken);

        await auditTrail.RecordAsync(
            new AuditEntry(
                "product_category.updated",
                "PRODUCT_CATEGORY",
                category.Id,
                Before: before,
                After: new Dictionary<string, object?> { ["name"] = name, ["description"] = description }),
            cancellationToken);
        logger.LogInformation("Product category {CategoryId} ({Code}) updated by {AccountId}", category.Id, category.Code, currentUser.AccountId);
        return ProductCategoryResponse.From(category);
    }

    /// <summary>Only an empty category goes: products.category_id has no foreign key, so this check is the guard.</summary>
    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var category = await FindAsync(id, cancellationToken);
        var products = await dbContext.Products.CountAsync(p => p.CategoryId == id, cancellationToken);
        if (products > 0)
        {
            throw new ConflictException(
                $"Product category '{category.Code}' still has {products} product(s). Move them to another category first.",
                "product_category_in_use");
        }

        dbContext.ProductCategories.Remove(category);
        await dbContext.SaveChangesAsync(cancellationToken);

        await auditTrail.RecordAsync(
            new AuditEntry(
                "product_category.deleted",
                "PRODUCT_CATEGORY",
                category.Id,
                Before: new Dictionary<string, object?> { ["code"] = category.Code, ["name"] = category.Name, ["description"] = category.Description }),
            cancellationToken);
        logger.LogInformation("Product category {CategoryId} ({Code}) deleted by {AccountId}", category.Id, category.Code, currentUser.AccountId);
    }

    private async Task<Entities.ProductCategory> FindAsync(Guid id, CancellationToken cancellationToken) =>
        await dbContext.ProductCategories.SingleOrDefaultAsync(c => c.Id == id, cancellationToken)
        ?? throw new NotFoundException($"Product category '{id}' was not found.", "product_category_not_found");
}

public static class ProductCategoryEditingEndpoints
{
    public static RouteGroupBuilder MapProductCategoryEditing(this RouteGroupBuilder group)
    {
        group.MapPut("/product-categories/{id:guid}", async (
            Guid id,
            UpdateProductCategoryRequest request,
            ProductCategoryEditingHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.UpdateAsync(id, request, cancellationToken)))
        .RequirePermission(Permissions.WarehouseWrite)
        .WithName("UpdateProductCategory")
        .WithSummary("Edit a product category")
        .WithDescription("Changes the name and description. The code cannot be changed.");

        group.MapDelete("/product-categories/{id:guid}", async (
            Guid id,
            ProductCategoryEditingHandler handler,
            CancellationToken cancellationToken) =>
        {
            await handler.DeleteAsync(id, cancellationToken);
            return Results.NoContent();
        })
        .RequirePermission(Permissions.WarehouseWrite)
        .WithName("DeleteProductCategory")
        .WithSummary("Delete an empty product category")
        .WithDescription("Refused with product_category_in_use while any product belongs to the category.");

        return group;
    }
}
