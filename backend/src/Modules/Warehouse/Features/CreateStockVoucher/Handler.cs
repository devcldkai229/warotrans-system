using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.AddStockVoucherLines;
using WaroTrans.Warehouse.Features.ConfirmStockVoucher;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateStockVoucher;

public sealed class CreateStockVoucherHandler(
    WarehouseDbContext dbContext,
    IBusinessCodeGenerator businessCodeGenerator,
    ICurrentUser currentUser,
    IValidator<CreateStockVoucherRequest> validator,
    AddStockVoucherLinesHandler lines,
    ConfirmStockVoucherHandler confirmation,
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
        if (request.Confirm && !currentUser.Can(Permissions.VoucherWrite))
        {
            throw new AppException("Voucher confirmation is not allowed.", 403, "forbidden");
        }

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

        // The voucher, its lines and the confirmation commit together: no half-made phiếu is left behind.
        await using var transaction = dbContext.Database.IsRelational() ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        dbContext.StockVouchers.Add(voucher);
        if (request.ContainerIds is { Count: > 0 } containerIds)
        {
            await lines.AddAsync(voucher, containerIds, cancellationToken);
            if (request.Confirm)
            {
                await confirmation.ConfirmAsync(voucher, accountId, cancellationToken);
            }
        }

        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        logger.LogInformation(
            "Stock voucher {VoucherId} ({Code}, {Type}, {Status}, {Count} Containers) created in warehouse {WarehouseId} by {AccountId}",
            voucher.Id,
            voucher.Code,
            voucher.Type,
            voucher.Status,
            voucher.Lines.Count,
            warehouse.Id,
            accountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }
}
