using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateProduct;

public sealed class CreateProductHandler(
    WarehouseDbContext dbContext,
    IValidator<CreateProductRequest> validator,
    ICurrentUser currentUser,
    ILogger<CreateProductHandler> logger)
{
    public async Task<ProductResponse> HandleAsync(CreateProductRequest request, CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var sku = request.Sku.Trim().ToUpperInvariant();
        var supplierBarcode = string.IsNullOrWhiteSpace(request.SupplierBarcode) ? null : request.SupplierBarcode.Trim();

        // products.category_id has no foreign key, so the category is checked here.
        if (!await dbContext.ProductCategories.AnyAsync(c => c.Id == request.CategoryId, cancellationToken))
        {
            throw new NotFoundException(
                $"Product category '{request.CategoryId}' was not found.",
                "product_category_not_found");
        }

        if (await dbContext.Products.AnyAsync(p => p.Sku == sku, cancellationToken))
        {
            throw SkuTaken(sku);
        }

        if (supplierBarcode is not null
            && await dbContext.Products.AnyAsync(p => p.SupplierBarcode == supplierBarcode, cancellationToken))
        {
            throw BarcodeTaken(supplierBarcode);
        }

        var now = DateTimeOffset.UtcNow;
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = request.CategoryId,
            Sku = sku,
            SupplierBarcode = supplierBarcode,
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Products.Add(product);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (UniqueViolation.ConstraintOf(exception) is { } constraint)
        {
            // Two Admins creating the same product at once: both pre-checks above passed.
            throw constraint.Contains("barcode", StringComparison.OrdinalIgnoreCase)
                ? BarcodeTaken(supplierBarcode ?? string.Empty)
                : SkuTaken(sku);
        }

        logger.LogInformation("Product {ProductId} ({Sku}) created by {AccountId}", product.Id, product.Sku, currentUser.AccountId);
        return ProductResponse.From(product);
    }

    private static ConflictException SkuTaken(string sku) =>
        new($"Product SKU '{sku}' already exists.", "product_sku_taken");

    private static ConflictException BarcodeTaken(string barcode) =>
        new($"Supplier barcode '{barcode}' already belongs to another product.", "product_supplier_barcode_taken");
}
