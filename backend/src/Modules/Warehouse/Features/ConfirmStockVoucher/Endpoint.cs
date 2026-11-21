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
        .WithDescription("INBOUND admits the received Containers; OUTBOUND reserves Containers on their shelves. No stock moves here: " +
            "it follows each Container as robots put it on a shelf (+1) or deliver it to an Outbound gate (-1, ISSUED), and the " +
            "voucher becomes COMPLETED with its last Container. Retrying a confirmation returns the voucher.");

        return group;
    }
}
