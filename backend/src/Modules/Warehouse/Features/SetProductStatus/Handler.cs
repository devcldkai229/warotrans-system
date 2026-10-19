using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.SetProductStatus;

public sealed class SetProductStatusHandler(
    WarehouseDbContext dbContext,
    ICurrentUser currentUser,
    ILogger<SetProductStatusHandler> logger)
{
    public async Task<ProductResponse> HandleAsync(Guid id, SetProductStatusRequest request, CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products.SingleOrDefaultAsync(p => p.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Product '{id}' was not found.", "product_not_found");

        // Setting the status it already has is accepted and changes nothing.
        if (product.IsActive != request.IsActive)
        {
            product.IsActive = request.IsActive;
            product.UpdatedAt = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "Product {ProductId} set to {Status} by {AccountId}",
                product.Id,
                request.IsActive ? "active" : "inactive",
                currentUser.AccountId);
        }

        return ProductResponse.From(product);
    }
}
