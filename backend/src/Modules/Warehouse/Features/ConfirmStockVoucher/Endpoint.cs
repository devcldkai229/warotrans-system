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
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("ConfirmStockVoucher")
        .WithSummary("Confirm a DRAFT stock voucher")
        .WithDescription(
            "Finalises the document; it does not wait for robots. Only Containers on a CONFIRMED voucher may be put " +
            "away (inbound) or taken off-shelf (outbound) by a Transport Request.");

        return group;
    }
}
