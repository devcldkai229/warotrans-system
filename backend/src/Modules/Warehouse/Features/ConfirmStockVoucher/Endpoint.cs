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
        .WithDescription("Posts warehouse admission for INBOUND or issues the selected Containers staged at Outbound. Retrying a posted confirmation returns the existing receipt.");

        return group;
    }
}
