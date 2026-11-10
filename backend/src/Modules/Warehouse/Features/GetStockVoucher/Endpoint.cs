using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.GetStockVoucher;

public static class GetStockVoucherEndpoint
{
    public static RouteGroupBuilder MapGetStockVoucher(this RouteGroupBuilder group)
    {
        group.MapGet("/stock-vouchers/{id:guid}", async (
            Guid id,
            WarehouseDbContext db,
            CancellationToken cancellationToken) =>
            Results.Ok(await StockVoucherQueries.LoadDetailAsync(db, id, cancellationToken)))
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("GetStockVoucher")
        .WithSummary("Get a stock voucher with its Containers and delivery progress")
        .WithDescription("Each line shows the Container's current status and shelf, and whether it is done for this voucher.");

        return group;
    }
}
