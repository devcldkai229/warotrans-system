using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Features.ListStockVouchers;

public static class ListStockVouchersEndpoint
{
    public static RouteGroupBuilder MapListStockVouchers(this RouteGroupBuilder group)
    {
        group.MapGet("/stock-vouchers", async (
            Guid warehouseId,
            StockVoucherType? type,
            StockVoucherStatus? status,
            string? search,
            int? skip,
            int? take,
            IValidator<ListStockVouchersRequest> validator,
            ListStockVouchersHandler handler,
            CancellationToken cancellationToken) =>
        {
            var request = new ListStockVouchersRequest(warehouseId, type, status, search, skip ?? 0, take ?? 50);
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            return Results.Ok(await handler.HandleAsync(request, cancellationToken));
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("ListStockVouchers")
        .WithSummary("List stock vouchers of a warehouse")
        .WithDescription("Newest first. Search matches the voucher code or reference number. Each row carries its delivery progress.");

        return group;
    }
}
