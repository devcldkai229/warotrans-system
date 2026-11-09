using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.IntegrationTests.Transportation.ListGetTransportRequest;

[Collection(IntegrationCollection.Name)]
public sealed class ListGetTransportRequestEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private const string Route = "/api/transportation/transport-requests";
    private static readonly Guid TestAccountId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private sealed record IdDto(Guid Id);

    private sealed record CreatedDto(Guid Id, string RequestCode, string Status);

    private sealed record ListDetailDto(
        Guid Id,
        int SequenceNo,
        Guid ContainerId,
        string? ContainerBarcode,
        Guid SourceEndpointId,
        string? SourceEndpointCode,
        Guid DestinationEndpointId,
        string? DestinationEndpointCode,
        string Status);

    private sealed record ListItemDto(
        Guid Id,
        string RequestCode,
        string Status,
        Guid WarehouseId,
        int DetailCount,
        List<ListDetailDto> Details);

    private sealed record ListResponseDto(List<ListItemDto> Items, int Total);

    private sealed record GetDetailDto(
        Guid Id,
        int SequenceNo,
        Guid ContainerId,
        string? ContainerBarcode,
        Guid? SourceStorageLocationId,
        string? SourceStorageLocationCode,
        Guid SourceEndpointId,
        string? SourceEndpointCode,
        string? SourceEndpointName,
        Guid DestinationEndpointId,
        string? DestinationEndpointCode,
        string Status);

    private sealed record GetDto(
        Guid Id,
        string RequestCode,
        string Status,
        Guid RequestedBy,
        List<GetDetailDto> Details);

    [Fact]
    public async Task Create_list_and_get_round_trip_with_labels_and_no_jobs()
    {
        var seed = await SeedAsync();
        var workflowId = await CreatePublishedWorkflowAsync();

        var create = await Client.PostAsJsonAsync(Route, new
        {
            warehouseId = seed.WarehouseId,
            mapVersionId = seed.MapVersionId,
            workflowId,
            workflowInputs = new Dictionary<string, object>(),
            details = new[]
            {
                new
                {
                    sequenceNo = 1,
                    containerId = seed.ContainerId,
                    sourceStorageLocationId = seed.SourceLocationId,
                    sourceEndpointId = seed.SourceEndpointId,
                    sourceLevelNo = (short)1,
                    destinationStorageLocationId = seed.DestinationLocationId,
                    destinationEndpointId = seed.DestinationEndpointId,
                    destinationLevelNo = (short)2
                }
            }
        }, JsonOptions);

        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = (await create.Content.ReadFromJsonAsync<CreatedDto>(JsonOptions))!;
        Assert.Equal("SUBMITTED", created.Status);

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            Assert.Equal(0, await execution.Jobs.CountAsync());
        }

        var list = await Client.GetFromJsonAsync<ListResponseDto>(
            $"{Route}?warehouseId={seed.WarehouseId}&search={created.RequestCode}",
            JsonOptions);
        Assert.NotNull(list);
        Assert.Equal(1, list.Total);
        var item = Assert.Single(list.Items);
        Assert.Equal(created.Id, item.Id);
        Assert.Equal(1, item.DetailCount);
        Assert.Equal("CTN-LIST-1", item.Details[0].ContainerBarcode);
        Assert.False(string.IsNullOrWhiteSpace(item.Details[0].SourceEndpointCode));

        var get = await Client.GetFromJsonAsync<GetDto>($"{Route}/{created.Id}", JsonOptions);
        Assert.NotNull(get);
        Assert.Equal(TestAccountId, get.RequestedBy);
        var detail = Assert.Single(get.Details);
        Assert.Equal("CTN-LIST-1", detail.ContainerBarcode);
        Assert.Equal(seed.SourceLocationId, detail.SourceStorageLocationId);
        Assert.Equal("LOC-SRC", detail.SourceStorageLocationCode);
        Assert.False(string.IsNullOrWhiteSpace(detail.SourceEndpointName));
    }

    [Fact]
    public async Task Get_unknown_returns_not_found()
    {
        var response = await Client.GetAsync($"{Route}/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Post_storage_location_endpoint_mismatch_is_rejected()
    {
        var seed = await SeedAsync();
        var workflowId = await CreatePublishedWorkflowAsync();

        var response = await Client.PostAsJsonAsync(Route, new
        {
            warehouseId = seed.WarehouseId,
            mapVersionId = seed.MapVersionId,
            workflowId,
            workflowInputs = new Dictionary<string, object>(),
            details = new[]
            {
                new
                {
                    sequenceNo = 1,
                    containerId = seed.ContainerId,
                    // Bind source location (tied to source endpoint) as the destination location.
                    destinationStorageLocationId = seed.SourceLocationId,
                    sourceEndpointId = seed.SourceEndpointId,
                    destinationEndpointId = seed.DestinationEndpointId
                }
            }
        }, JsonOptions);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("storage_location_endpoint_mismatch", json.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task List_containers_and_storage_locations()
    {
        var seed = await SeedAsync();

        var containers = await Client.GetFromJsonAsync<JsonElement>(
            $"/api/warehouse/containers?warehouseId={seed.WarehouseId}&eligibleOnly=true");
        Assert.True(containers.GetProperty("total").GetInt32() >= 1);

        var locations = await Client.GetFromJsonAsync<JsonElement>(
            $"/api/warehouse/storage-locations?warehouseId={seed.WarehouseId}&activeOnly=true");
        Assert.True(locations.GetProperty("total").GetInt32() >= 2);
    }

    private Task<TransportRequestScenario.Seed> SeedAsync() => TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-LIST-1");

    private Task<Guid> CreatePublishedWorkflowAsync() => TransportRequestScenario.CreatePublishedWorkflowAsync(Client);
}
