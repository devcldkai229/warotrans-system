using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.CreateStockVoucher;

public static class CreateStockVoucherEndpoint
{
    public static RouteGroupBuilder MapCreateStockVoucher(this RouteGroupBuilder group)
    {
        group.MapPost("/stock-vouchers", async (
            CreateStockVoucherRequest request,
            CreateStockVoucherHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/warehouse/stock-vouchers/{response.Id}", response);
        })
        .WithName("CreateStockVoucher")
        .WithSummary("Open a DRAFT inbound or outbound stock voucher")
        .WithDescription("Code is generated: PN-YYYYMMDD-SEQ6 for INBOUND, PX-YYYYMMDD-SEQ6 for OUTBOUND.")
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin);

        return group;
    }
}
