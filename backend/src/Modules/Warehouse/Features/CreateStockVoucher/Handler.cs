using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateStockVoucher;

public sealed class CreateStockVoucherHandler(
    WarehouseDbContext dbContext,
    IBusinessCodeGenerator businessCodeGenerator,
    ICurrentUser currentUser,
    IValidator<CreateStockVoucherRequest> validator,
    ILogger<CreateStockVoucherHandler> logger)
{
    public async Task<StockVoucherDetailResponse> HandleAsync(
        CreateStockVoucherRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var accountId = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");

        var warehouse = await dbContext.Warehouses
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == request.WarehouseId, cancellationToken)
            ?? throw new NotFoundException($"Warehouse '{request.WarehouseId}' was not found.", "warehouse_not_found");

        if (!warehouse.IsActive)
        {
            throw new DomainValidationException($"Warehouse '{warehouse.Code}' is inactive.", "warehouse_inactive");
        }

        var code = request.Type == StockVoucherType.INBOUND
            ? await businessCodeGenerator.NextInboundVoucherCodeAsync(cancellationToken: cancellationToken)
            : await businessCodeGenerator.NextOutboundVoucherCodeAsync(cancellationToken: cancellationToken);

        var voucher = StockVoucher.Create(
            code,
            request.Type,
            warehouse.Id,
            request.ReferenceNo,
            request.Note,
            accountId,
            DateTimeOffset.UtcNow);

        dbContext.StockVouchers.Add(voucher);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Stock voucher {VoucherId} ({Code}, {Type}) created in warehouse {WarehouseId} by {AccountId}",
            voucher.Id,
            voucher.Code,
            voucher.Type,
            warehouse.Id,
            accountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }
}
