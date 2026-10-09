using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using WaroTrans.Fleet.Enums;
using WaroTrans.IntegrationTests.Infrastructure;

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
    public async Task Register_robot_persists_and_returns_code()
    {
        var warehouseId = Guid.NewGuid();
        var mapVersionId = Guid.NewGuid();

        var response = await Client.PostAsJsonAsync("/api/fleet/robots", new
        {
            warehouseId,
            currentMapVersionId = mapVersionId,
            name = "Alpha Bot"
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var robot = await response.Content.ReadFromJsonAsync<RobotDto>(JsonOptions);
        Assert.NotNull(robot);
        Assert.StartsWith("RBT-", robot.Code, StringComparison.Ordinal);
        Assert.Equal("Alpha Bot", robot.Name);
        Assert.Equal(warehouseId, robot.WarehouseId);
        Assert.Equal(mapVersionId, robot.CurrentMapVersionId);
        Assert.Equal(RobotStatus.OFFLINE, robot.Status);
        Assert.True(robot.IsEnabled);
        Assert.NotEqual(Guid.Empty, robot.Id);
    }

    [Fact]
    public async Task Get_robot_returns_created()
    {
        var created = await RegisterAsync("Get Me");

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
        var warehouseA = Guid.NewGuid();
        var warehouseB = Guid.NewGuid();
        await RegisterAsync("A1", warehouseA);
        await RegisterAsync("A2", warehouseA);
        await RegisterAsync("B1", warehouseB);

        var response = await Client.GetAsync($"/api/fleet/robots?warehouseId={warehouseA}");

        response.EnsureSuccessStatusCode();
        var list = await response.Content.ReadFromJsonAsync<ListDto>(JsonOptions);
        Assert.NotNull(list);
        Assert.Equal(2, list.Total);
        Assert.Equal(2, list.Items.Count);
        Assert.All(list.Items, r => Assert.Equal(warehouseA, r.WarehouseId));
    }

    [Fact]
    public async Task Enable_disable_robot_roundtrip()
    {
        var created = await RegisterAsync("Toggle Bot");

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

    private async Task<RobotDto> RegisterAsync(string name, Guid? warehouseId = null)
    {
        var response = await Client.PostAsJsonAsync("/api/fleet/robots", new
        {
            warehouseId = warehouseId ?? Guid.NewGuid(),
            currentMapVersionId = Guid.NewGuid(),
            name
        });
        response.EnsureSuccessStatusCode();
        var robot = await response.Content.ReadFromJsonAsync<RobotDto>(JsonOptions);
        return robot ?? throw new InvalidOperationException("Register returned empty body.");
    }

    private sealed record RobotDto(
        Guid Id,
        Guid WarehouseId,
        Guid CurrentMapVersionId,
        string Code,
        string Name,
        RobotStatus Status,
        decimal BatteryPercent,
        bool IsEnabled);

    private sealed record ListDto(IReadOnlyList<RobotDto> Items, int Total);
}
