using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.AddStockVoucherLines;

public static class AddStockVoucherLinesEndpoint
{
    public static RouteGroupBuilder MapAddStockVoucherLines(this RouteGroupBuilder group)
    {
        group.MapPost("/stock-vouchers/{id:guid}/lines", async (
            Guid id,
            AddStockVoucherLinesRequest request,
            AddStockVoucherLinesHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, request, cancellationToken)))
        .RequirePermission(Permissions.VoucherWrite)
        .WithName("AddStockVoucherLines")
        .WithSummary("Add Containers to a DRAFT stock voucher")
        .WithDescription("Add selected Container IDs to a draft. OUTBOUND requires staging at a currently published Outbound gate. Replaying IDs already on the draft is a no-op.");

        return group;
    }
}
