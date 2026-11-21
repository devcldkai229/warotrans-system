using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.CloseStockVoucherShort;

public sealed record CloseStockVoucherShortRequest(string? Reason);

public static class CloseStockVoucherShortEndpoint
{
    public static RouteGroupBuilder MapCloseStockVoucherShort(this RouteGroupBuilder group)
    {
        group.MapPost("/stock-vouchers/{id:guid}/close-short", async (
            Guid id,
            CloseStockVoucherShortRequest request,
            CloseStockVoucherShortHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, request, cancellationToken)))
        .RequirePermission(Permissions.VoucherWrite)
        .WithName("CloseStockVoucherShort")
        .WithSummary("Stop waiting for the Containers of a CONFIRMED voucher that are not done yet")
        .WithDescription(
            "A reason is required. Lines not done are closed and their Containers leave the voucher (an inbound one is " +
            "no longer admitted and needs a new phiếu nhập). The voucher becomes COMPLETED when at least one line is done, " +
            "CANCELLED otherwise. Refused while a Container of the voucher is in an active Transport Request or still on " +
            "a robot (IN_TRANSIT: recover it first).");

        return group;
    }
}
