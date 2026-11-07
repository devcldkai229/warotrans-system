using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.RemoveStockVoucherLine;

public static class RemoveStockVoucherLineEndpoint
{
    public static RouteGroupBuilder MapRemoveStockVoucherLine(this RouteGroupBuilder group)
    {
        group.MapDelete("/stock-vouchers/{id:guid}/lines/{lineId:guid}", async (
            Guid id,
            Guid lineId,
            RemoveStockVoucherLineHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, lineId, cancellationToken)))
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("RemoveStockVoucherLine")
        .WithSummary("Take a Container off a DRAFT stock voucher")
        .WithDescription("The Container itself is not changed.");

        return group;
    }
}
