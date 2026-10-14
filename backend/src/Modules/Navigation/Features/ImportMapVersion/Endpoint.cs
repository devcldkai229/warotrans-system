using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.ImportMapVersion;

public static class ImportMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/warehouses/{warehouseId:guid}/maps/import", async (
            Guid warehouseId,
            HttpRequest httpRequest,
            ImportMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            if (!httpRequest.HasFormContentType)
            {
                return Results.BadRequest(new { error = "multipart/form-data required with yaml and pgm files." });
            }

            var form = await httpRequest.ReadFormAsync(cancellationToken);
            var yamlFile = form.Files.GetFile("yaml") ?? form.Files.GetFile("map.yaml");
            var pgmFile = form.Files.GetFile("pgm") ?? form.Files.GetFile("map.pgm");
            var name = form["name"].FirstOrDefault();

            if (yamlFile is null || pgmFile is null)
            {
                return Results.BadRequest(new { error = "Form fields 'yaml' and 'pgm' are required." });
            }

            await using var yamlStream = yamlFile.OpenReadStream();
            await using var pgmStream = pgmFile.OpenReadStream();
            var response = await handler.HandleAsync(warehouseId, yamlStream, pgmStream, name, cancellationToken);
            return Results.Created($"/api/navigation/maps/{response.Id}", response);
        })
        .DisableAntiforgery()
        .WithName("ImportMapVersion")
        .WithSummary("Import a ROS/Nav2 occupancy map (yaml + pgm)")
        .WithDescription(
            "Accepts multipart form fields yaml and pgm. Creates a DRAFT MapVersion with metadata, " +
            "stores files under data/maps, and generates a PNG preview.");
    }
}
