using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Warehouse.Features.GetContainer;

public static class GetContainerEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/containers/{id:guid}", async (
            Guid id,
            GetContainerHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.GetByIdAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetContainerById")
        .WithSummary("Get Container by ID")
        .WithDescription("Retrieves detailed information of a Container by its UUID.");

        endpoints.MapGet("/containers/by-barcode/{barcode}", async (
            string barcode,
            GetContainerHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.GetByBarcodeAsync(barcode, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetContainerByBarcode")
        .WithSummary("Get Container by barcode")
        .WithDescription("Retrieves detailed information of a Container by its internal barcode.");
    }
}
