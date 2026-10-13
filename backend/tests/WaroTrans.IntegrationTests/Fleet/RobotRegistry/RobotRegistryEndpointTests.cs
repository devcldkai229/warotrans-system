using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Enums;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Fleet.RobotRegistry;

[Collection(IntegrationCollection.Name)]
public sealed class RobotRegistryEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    [Fact]
    public async Task Register_robot_persists_and_returns_initial_state()
    {
        var scenario = await SeedScenarioAsync();
        var code = UniqueCode("ALPHA");

        var response = await Client.PostAsJsonAsync("/api/fleet/robots", new
        {
            warehouseId = scenario.WarehouseId,
            currentMapVersionId = scenario.MapVersionId,
            code,
            name = "Alpha Bot"
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var robot = await response.Content.ReadFromJsonAsync<RobotDto>(JsonOptions);
        Assert.NotNull(robot);
        Assert.Equal(code, robot.Code);
        Assert.Equal("Alpha Bot", robot.Name);
        Assert.Equal(scenario.WarehouseId, robot.WarehouseId);
        Assert.Equal(scenario.MapVersionId, robot.CurrentMapVersionId);
        Assert.Equal(RobotStatus.OFFLINE, robot.Status);
        Assert.False(robot.IsOnline);
        Assert.True(robot.IsEnabled);
        Assert.Equal(0m, robot.BatteryPercent);
        Assert.NotEqual(Guid.Empty, robot.Id);
    }

    [Fact]
    public async Task Register_duplicate_code_returns_conflict()
    {
        var scenario = await SeedScenarioAsync();
        var code = UniqueCode("DUP");
        await RegisterAsync(scenario, "First", code);

        var response = await Client.PostAsJsonAsync("/api/fleet/robots", new
        {
            warehouseId = scenario.WarehouseId,
            currentMapVersionId = scenario.MapVersionId,
            code,
            name = "Second"
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Register_unknown_warehouse_returns_404()
    {
        var scenario = await SeedScenarioAsync();

        var response = await Client.PostAsJsonAsync("/api/fleet/robots", new
        {
            warehouseId = Guid.NewGuid(),
            currentMapVersionId = scenario.MapVersionId,
            code = UniqueCode("NOWH"),
            name = "No Warehouse"
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Register_map_wrong_warehouse_returns_validation_error()
    {
        var warehouseA = await SeedScenarioAsync();
        var warehouseB = await SeedScenarioAsync();

        var response = await Client.PostAsJsonAsync("/api/fleet/robots", new
        {
            warehouseId = warehouseA.WarehouseId,
            currentMapVersionId = warehouseB.MapVersionId,
            code = UniqueCode("MISM"),
            name = "Mismatch"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_robot_returns_created()
    {
        var scenario = await SeedScenarioAsync();
        var created = await RegisterAsync(scenario, "Get Me");

        var response = await Client.GetAsync($"/api/fleet/robots/{created.Id}");

        response.EnsureSuccessStatusCode();
        var robot = await response.Content.ReadFromJsonAsync<RobotDto>(JsonOptions);
        Assert.NotNull(robot);
        Assert.Equal(created.Id, robot.Id);
        Assert.Equal(created.Code, robot.Code);
        Assert.Equal("Get Me", robot.Name);
    }

    [Fact]
    public async Task List_robots_filters_by_warehouse()
    {
        var warehouseA = await SeedScenarioAsync();
        var warehouseB = await SeedScenarioAsync();
        await RegisterAsync(warehouseA, "A1");
        await RegisterAsync(warehouseA, "A2");
        await RegisterAsync(warehouseB, "B1");

        var response = await Client.GetAsync($"/api/fleet/robots?warehouseId={warehouseA.WarehouseId}");

        response.EnsureSuccessStatusCode();
        var list = await response.Content.ReadFromJsonAsync<ListDto>(JsonOptions);
        Assert.NotNull(list);
        Assert.True(list.Total >= 2);
        Assert.All(list.Items, r => Assert.Equal(warehouseA.WarehouseId, r.WarehouseId));
    }

    [Fact]
    public async Task Enable_disable_robot_roundtrip()
    {
        var scenario = await SeedScenarioAsync();
        var created = await RegisterAsync(scenario, "Toggle Bot");

        var disable = await Client.PostAsync($"/api/fleet/robots/{created.Id}/disable", null);
        disable.EnsureSuccessStatusCode();
        var disabled = await disable.Content.ReadFromJsonAsync<RobotDto>(JsonOptions);
        Assert.NotNull(disabled);
        Assert.False(disabled.IsEnabled);

        var enable = await Client.PostAsync($"/api/fleet/robots/{created.Id}/enable", null);
        enable.EnsureSuccessStatusCode();
        var enabled = await enable.Content.ReadFromJsonAsync<RobotDto>(JsonOptions);
        Assert.NotNull(enabled);
        Assert.True(enabled.IsEnabled);
    }

    [Fact]
    public async Task Get_unknown_robot_returns_404()
    {
        var response = await Client.GetAsync($"/api/fleet/robots/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task List_warehouses_returns_seeded()
    {
        var scenario = await SeedScenarioAsync();

        var response = await Client.GetAsync("/api/warehouse/warehouses?isActive=true");

        response.EnsureSuccessStatusCode();
        var list = await response.Content.ReadFromJsonAsync<WarehouseListDto>(JsonOptions);
        Assert.NotNull(list);
        Assert.Contains(list.Items, w => w.Id == scenario.WarehouseId);
    }

    private async Task<RobotDto> RegisterAsync(Scenario scenario, string name, string? code = null)
    {
        var response = await Client.PostAsJsonAsync("/api/fleet/robots", new
        {
            warehouseId = scenario.WarehouseId,
            currentMapVersionId = scenario.MapVersionId,
            code = code ?? UniqueCode(name),
            name
        });
        response.EnsureSuccessStatusCode();
        var robot = await response.Content.ReadFromJsonAsync<RobotDto>(JsonOptions);
        return robot ?? throw new InvalidOperationException("Register returned empty body.");
    }

    private async Task<Scenario> SeedScenarioAsync()
    {
        var warehouseId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var suffix = warehouseId.ToString("N")[..8].ToUpperInvariant();

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
            {
                Id = warehouseId,
                Code = $"WH-{suffix}",
                Name = $"Warehouse {suffix}",
                Timezone = "Asia/Ho_Chi_Minh",
                IsActive = true,
                CreatedAt = now
            });
            await db.SaveChangesAsync();
        }

        var mapResponse = await Client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{warehouseId}/maps",
            new
            {
                name = "Map",
                mapUri = "http://storage/map.yaml",
                resolution = 0.05,
                originX = 0,
                originY = 0,
                originYaw = 0
            });
        mapResponse.EnsureSuccessStatusCode();
        var mapId = (await mapResponse.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        return new Scenario(warehouseId, mapId);
    }

    private static string UniqueCode(string seed) =>
        $"RBT-{seed.Replace(" ", "", StringComparison.Ordinal).ToUpperInvariant()}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

    private sealed record Scenario(Guid WarehouseId, Guid MapVersionId);

    private sealed record IdDto(Guid Id);

    private sealed record RobotDto(
        Guid Id,
        Guid WarehouseId,
        Guid CurrentMapVersionId,
        string Code,
        string Name,
        RobotStatus Status,
        bool IsOnline,
        decimal BatteryPercent,
        bool IsEnabled);

    private sealed record ListDto(IReadOnlyList<RobotDto> Items, int Total);

    private sealed record WarehouseListItemDto(Guid Id, string Code, string Name, bool IsActive);

    private sealed record WarehouseListDto(IReadOnlyList<WarehouseListItemDto> Items, int Total);
}
