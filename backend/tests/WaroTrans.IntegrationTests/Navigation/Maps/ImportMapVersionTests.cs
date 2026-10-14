using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Navigation.Maps;

[Collection(IntegrationCollection.Name)]
public sealed class ImportMapVersionTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private sealed record MapDto(
        Guid Id,
        Guid WarehouseId,
        string Code,
        string Status,
        double Resolution,
        double OriginX,
        double OriginY,
        double OriginYaw,
        int ImageWidthPixels,
        int ImageHeightPixels,
        bool Negate,
        double OccupiedThreshold,
        double FreeThreshold,
        string MapUri,
        string? MapYamlUri,
        string? PreviewImageUri,
        string? ContentHash);

    private async Task<Guid> SeedWarehouseAsync()
    {
        var warehouseId = Guid.NewGuid();
        var suffix = warehouseId.ToString("N")[..8].ToUpperInvariant();
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
        {
            Id = warehouseId,
            Code = $"WH-{suffix}",
            Name = $"Warehouse {suffix}",
            Timezone = "Asia/Ho_Chi_Minh",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
        return warehouseId;
    }

    private static byte[] TinyPgmP5(int width = 4, int height = 3)
    {
        var header = Encoding.ASCII.GetBytes($"P5\n{width} {height}\n255\n");
        var pixels = new byte[width * height];
        for (var i = 0; i < pixels.Length; i++)
        {
            pixels[i] = (byte)(i * 20);
        }

        var result = new byte[header.Length + pixels.Length];
        Buffer.BlockCopy(header, 0, result, 0, header.Length);
        Buffer.BlockCopy(pixels, 0, result, header.Length, pixels.Length);
        return result;
    }

    private static string TinyYaml() =>
        """
        image: map.pgm
        resolution: 0.05
        origin: [-1.5, -2.25, 0.0]
        negate: 0
        occupied_thresh: 0.65
        free_thresh: 0.25
        """;

    [Fact]
    public async Task Import_yaml_and_pgm_creates_draft_with_metadata_and_preview()
    {
        var warehouseId = await SeedWarehouseAsync();
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Sample import"), "name");

        var yamlBytes = Encoding.UTF8.GetBytes(TinyYaml());
        var yamlContent = new ByteArrayContent(yamlBytes);
        yamlContent.Headers.ContentType = new MediaTypeHeaderValue("text/yaml");
        form.Add(yamlContent, "yaml", "map.yaml");

        var pgmBytes = TinyPgmP5();
        var pgmContent = new ByteArrayContent(pgmBytes);
        pgmContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(pgmContent, "pgm", "map.pgm");

        var response = await Client.PostAsync($"/api/navigation/warehouses/{warehouseId}/maps/import", form);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<MapDto>())!;
        Assert.Equal("DRAFT", created.Status);
        Assert.StartsWith("MAP-", created.Code);
        Assert.Equal(0.05, created.Resolution);
        Assert.Equal(-1.5, created.OriginX);
        Assert.Equal(-2.25, created.OriginY);
        Assert.Equal(0.0, created.OriginYaw);
        Assert.Equal(4, created.ImageWidthPixels);
        Assert.Equal(3, created.ImageHeightPixels);
        Assert.False(created.Negate);
        Assert.Equal(0.65, created.OccupiedThreshold);
        Assert.Equal(0.25, created.FreeThreshold);
        Assert.False(string.IsNullOrWhiteSpace(created.ContentHash));
        Assert.StartsWith("/map-assets/", created.MapUri);
        Assert.NotNull(created.PreviewImageUri);
        Assert.EndsWith("map-preview.png", created.PreviewImageUri);

        var preview = await Client.GetAsync(created.PreviewImageUri);
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.Equal("image/png", preview.Content.Headers.ContentType?.MediaType);
        var png = await preview.Content.ReadAsByteArrayAsync();
        Assert.True(png.Length > 8);
        Assert.Equal(0x89, png[0]);
        Assert.Equal((byte)'P', png[1]);
        Assert.Equal((byte)'N', png[2]);
        Assert.Equal((byte)'G', png[3]);
    }
}
