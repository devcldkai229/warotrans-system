using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Navigation.Endpoints;

[Collection(IntegrationCollection.Name)]
public sealed class EndpointDeleteTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private sealed record MapDto(Guid Id);
    private sealed record EndpointDto(Guid Id, string Code);

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

    private async Task<Guid> CreateDraftMapAsync()
    {
        var warehouseId = await SeedWarehouseAsync();
        var response = await Client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Map", mapUri = "/map-assets/map.pgm", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MapDto>())!.Id;
    }

    private async Task<EndpointDto> CreateEndpointAsync(Guid mapId)
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", new
        {
            name = "Dock Delete",
            endpointType = "INBOUND",
            x = 1.0,
            y = 2.0,
            yaw = 0.0,
            positionTolerance = 0.1,
            yawTolerance = 0.2
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EndpointDto>())!;
    }

    private static async Task<string?> ProblemCodeAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    [Fact]
    public async Task Delete_endpoint_removes_it_from_draft_map()
    {
        var mapId = await CreateDraftMapAsync();
        var endpoint = await CreateEndpointAsync(mapId);

        var response = await Client.DeleteAsync($"/api/navigation/endpoints/{endpoint.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var missing = await Client.GetAsync($"/api/navigation/endpoints/{endpoint.Id}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Delete_endpoint_returns_400_when_map_published()
    {
        var mapId = await CreateDraftMapAsync();
        var endpoint = await CreateEndpointAsync(mapId);
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        var response = await Client.DeleteAsync($"/api/navigation/endpoints/{endpoint.Id}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("map_version_not_draft", await ProblemCodeAsync(response));
        var stillThere = await Client.GetAsync($"/api/navigation/endpoints/{endpoint.Id}");
        Assert.Equal(HttpStatusCode.OK, stillThere.StatusCode);
    }

    [Fact]
    public async Task Delete_endpoint_returns_404_when_missing()
    {
        var response = await Client.DeleteAsync($"/api/navigation/endpoints/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("endpoint_not_found", await ProblemCodeAsync(response));
    }
}
