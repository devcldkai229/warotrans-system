using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.CancelStockVoucher;

public static class CancelStockVoucherEndpoint
{
    public static RouteGroupBuilder MapCancelStockVoucher(this RouteGroupBuilder group)
    {
        group.MapPost("/stock-vouchers/{id:guid}/cancel", async (
            Guid id,
            CancelStockVoucherHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, cancellationToken)))
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("CancelStockVoucher")
        .WithSummary("Cancel a DRAFT stock voucher")
        .WithDescription("A CONFIRMED voucher cannot be cancelled. Its Containers are freed for other vouchers.");

        return group;
    }
}
