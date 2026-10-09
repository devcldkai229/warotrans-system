using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ResolveProduct;

public sealed class ResolveProductHandler(
    WarehouseDbContext dbContext,
    IValidator<ResolveProductRequest> validator)
{
    public async Task<ResolveProductResponse> HandleAsync(
        ResolveProductRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        if (!string.IsNullOrWhiteSpace(request.Barcode))
        {
            var trimmedBarcode = request.Barcode.Trim();
            var product = await dbContext.Products
                .AsNoTracking()
                .Where(p => p.IsActive && (p.SupplierBarcode == trimmedBarcode || p.Sku == trimmedBarcode))
                .Select(p => new ProductDto(
                    p.Id,
                    p.CategoryId,
                    p.Sku,
                    p.SupplierBarcode,
                    p.Name,
                    p.Description,
                    p.IsActive))
                .FirstOrDefaultAsync(cancellationToken);

            if (product is null)
            {
                throw new NotFoundException($"Product with barcode '{trimmedBarcode}' was not found.", "product_not_found");
            }

            return new ResolveProductResponse(product, [product]);
        }

        var lowerQuery = request.Query!.Trim().ToLowerInvariant();
        var pattern = $"%{lowerQuery}%";
        var items = await dbContext.Products
            .AsNoTracking()
            .Where(p => p.IsActive && (
                EF.Functions.Like(p.Name.ToLower(), pattern) ||
                EF.Functions.Like(p.Sku.ToLower(), pattern) ||
                (p.SupplierBarcode != null && EF.Functions.Like(p.SupplierBarcode.ToLower(), pattern))))
            .OrderBy(p => p.Name)
            .Take(request.Limit)
            .Select(p => new ProductDto(
                p.Id,
                p.CategoryId,
                p.Sku,
                p.SupplierBarcode,
                p.Name,
                p.Description,
                p.IsActive))
            .ToListAsync(cancellationToken);

        return new ResolveProductResponse(null, items);
    }
}
