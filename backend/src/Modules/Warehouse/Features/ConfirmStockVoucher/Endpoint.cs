using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.ConfirmStockVoucher;

public static class ConfirmStockVoucherEndpoint
{
    public static RouteGroupBuilder MapConfirmStockVoucher(this RouteGroupBuilder group)
    {
        group.MapPost("/stock-vouchers/{id:guid}/confirm", async (
            Guid id,
            ConfirmStockVoucherHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, cancellationToken)))
        .RequirePermission(Permissions.VoucherWrite)
        .WithName("ConfirmStockVoucher")
        .WithSummary("Confirm a DRAFT stock voucher")
        .WithDescription("Atomically confirms and posts INBOUND stock once at configured Inbound. A retry returns the existing posting receipt. OUTBOUND confirmation is unavailable until staged eligibility and outbound posting are implemented.");

        return group;
    }
}
