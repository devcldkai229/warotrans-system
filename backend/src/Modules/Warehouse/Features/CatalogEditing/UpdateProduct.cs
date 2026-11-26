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

/// <summary>
/// Changes what describes a Product. The SKU is not editable: it is printed on labels and written on vouchers.
/// A non-empty supplier barcode stays unique.
/// </summary>
public sealed record UpdateProductRequest(Guid CategoryId, string Name, string? SupplierBarcode = null, string? Description = null);

public sealed class UpdateProductValidator : AbstractValidator<UpdateProductRequest>
{
    public UpdateProductValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty().WithMessage("CategoryId is required.");
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

public sealed class UpdateProductHandler(
    WarehouseDbContext dbContext,
    IValidator<UpdateProductRequest> validator,
    IAuditTrail auditTrail,
    ICurrentUser currentUser,
    ILogger<UpdateProductHandler> logger)
{
    public async Task<ProductResponse> HandleAsync(Guid id, UpdateProductRequest request, CancellationToken cancellationToken = default)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var product = await dbContext.Products.SingleOrDefaultAsync(p => p.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Product '{id}' was not found.", "product_not_found");

        var name = request.Name.Trim();
        var barcode = string.IsNullOrWhiteSpace(request.SupplierBarcode) ? null : request.SupplierBarcode.Trim();
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        if (product.CategoryId != request.CategoryId
            && !await dbContext.ProductCategories.AnyAsync(c => c.Id == request.CategoryId, cancellationToken))
        {
            throw new NotFoundException($"Product category '{request.CategoryId}' was not found.", "product_category_not_found");
        }

        if (barcode is not null && barcode != product.SupplierBarcode
            && await dbContext.Products.AnyAsync(p => p.Id != id && p.SupplierBarcode == barcode, cancellationToken))
        {
            throw BarcodeTaken(barcode);
        }

        var before = Snapshot(product.CategoryId, product.Name, product.SupplierBarcode, product.Description);
        var after = Snapshot(request.CategoryId, name, barcode, description);
        if (before.All(entry => Equals(entry.Value, after[entry.Key])))
        {
            return ProductResponse.From(product);
        }

        product.CategoryId = request.CategoryId;
        product.Name = name;
        product.SupplierBarcode = barcode;
        product.Description = description;
        product.UpdatedAt = DateTimeOffset.UtcNow;
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (UniqueViolation.ConstraintOf(exception) is not null)
        {
            throw BarcodeTaken(barcode ?? string.Empty);
        }

        await auditTrail.RecordAsync(new AuditEntry("product.updated", "PRODUCT", product.Id, Before: before, After: after), cancellationToken);
        logger.LogInformation("Product {ProductId} ({Sku}) updated by {AccountId}", product.Id, product.Sku, currentUser.AccountId);
        return ProductResponse.From(product);
    }

    private static Dictionary<string, object?> Snapshot(Guid categoryId, string name, string? barcode, string? description) => new()
    {
        ["categoryId"] = categoryId,
        ["name"] = name,
        ["supplierBarcode"] = barcode,
        ["description"] = description
    };

    private static ConflictException BarcodeTaken(string barcode) =>
        new($"Supplier barcode '{barcode}' already belongs to another product.", "product_supplier_barcode_taken");
}

public static class UpdateProductEndpoint
{
    public static RouteGroupBuilder MapUpdateProduct(this RouteGroupBuilder group)
    {
        group.MapPut("/products/{id:guid}", async (
            Guid id,
            UpdateProductRequest request,
            UpdateProductHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, request, cancellationToken)))
        .RequirePermission(Permissions.WarehouseWrite)
        .WithName("UpdateProduct")
        .WithSummary("Edit a product")
        .WithDescription("Changes name, category, supplier barcode and description. The SKU cannot be changed.");

        return group;
    }
}
