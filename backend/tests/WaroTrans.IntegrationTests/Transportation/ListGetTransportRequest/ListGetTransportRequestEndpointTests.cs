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

    private sealed record Seed(
        Guid WarehouseId,
        Guid MapVersionId,
        Guid SourceEndpointId,
        Guid DestinationEndpointId,
        Guid SourceLocationId,
        Guid DestinationLocationId,
        Guid ContainerId);

    private async Task<Seed> SeedAsync()
    {
        var warehouseId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var containerId = Guid.NewGuid();
        var sourceLocationId = Guid.NewGuid();
        var destinationLocationId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            var category = new ProductCategory { Id = Guid.NewGuid(), Code = $"CAT-LG-{suffix}", Name = "LG" };
            var product = new Product
            {
                Id = productId,
                CategoryId = category.Id,
                Sku = $"SKU-LG-{suffix}",
                Name = "ListGet product",
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            };
            db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
            {
                Id = warehouseId,
                Code = $"WH-LG-{suffix}",
                Name = "ListGet warehouse",
                Timezone = "Asia/Ho_Chi_Minh",
                IsActive = true,
                CreatedAt = now
            });
            db.ProductCategories.Add(category);
            db.Products.Add(product);
            await db.SaveChangesAsync();
        }

        var mapResponse = await Client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Map", mapUri = "http://storage/map.yaml", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        mapResponse.EnsureSuccessStatusCode();
        var mapId = (await mapResponse.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;

        var sourceEndpointId = await CreateEndpointAsync(mapId, "Source Shelf");
        var destinationEndpointId = await CreateEndpointAsync(mapId, "Destination Shelf");
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            db.StorageLocations.AddRange(
                new StorageLocation
                {
                    Id = sourceLocationId,
                    WarehouseId = warehouseId,
                    EndpointId = sourceEndpointId,
                    Code = "LOC-SRC",
                    Name = "Source",
                    IsActive = true,
                    CreatedAt = now
                },
                new StorageLocation
                {
                    Id = destinationLocationId,
                    WarehouseId = warehouseId,
                    EndpointId = destinationEndpointId,
                    Code = "LOC-DST",
                    Name = "Destination",
                    IsActive = true,
                    CreatedAt = now
                });
            db.Containers.Add(new Container
            {
                Id = containerId,
                ProductId = productId,
                Barcode = "CTN-LIST-1",
                Status = ContainerStatus.STORED,
                CurrentStorageLocationId = sourceLocationId,
                CurrentLevelNo = 1,
                CreatedBy = TestAccountId,
                CreatedAt = now,
                UpdatedAt = now
            });
            await db.SaveChangesAsync();
        }

        return new Seed(
            warehouseId,
            mapId,
            sourceEndpointId,
            destinationEndpointId,
            sourceLocationId,
            destinationLocationId,
            containerId);
    }

    private async Task<Guid> CreateEndpointAsync(Guid mapId, string name)
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", new
        {
            name,
            endpointType = "STORAGE",
            x = 1.0,
            y = 2.0,
            yaw = 0.0,
            positionTolerance = 0.1,
            yawTolerance = 0.2
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
    }

    private async Task<Guid> CreatePublishedWorkflowAsync()
    {
        var body = new
        {
            code = "LG_TR_" + Guid.NewGuid().ToString("N")[..8],
            name = "ListGet workflow",
            variables = new List<WorkflowVariableDefinition>
            {
                new()
                {
                    Key = "minBatteryPercent",
                    Name = "minBatteryPercent",
                    DataType = WorkflowDataType.DECIMAL,
                    Source = WorkflowVariableSource.ADMIN_INPUT,
                    IsRequired = true,
                    SequenceNo = 0,
                    ConfiguredValue = JsonSerializer.SerializeToElement(25m)
                },
                new()
                {
                    Key = "assignedRobotId",
                    Name = "assignedRobotId",
                    DataType = WorkflowDataType.UUID,
                    Source = WorkflowVariableSource.SYSTEM_VALUE,
                    IsRequired = true,
                    SequenceNo = 1
                },
                new()
                {
                    Key = "transportRequestId",
                    Name = "transportRequestId",
                    DataType = WorkflowDataType.UUID,
                    Source = WorkflowVariableSource.SYSTEM_VALUE,
                    IsRequired = true,
                    SequenceNo = 2
                }
            },
            tasks = new object[]
            {
                new
                {
                    taskKey = "PICKUP",
                    name = "Pickup",
                    sequenceNo = 1,
                    steps = new object[]
                    {
                        new
                        {
                            stepKey = "MOVE_PICKUP",
                            name = "MOVE_PICKUP",
                            stepType = StepType.MOVE,
                            operationCode = "PICKUP",
                            sequenceNo = 1,
                            inputBindings = new Dictionary<string, StepInputBinding>
                            {
                                ["robotId"] = new()
                                {
                                    SourceType = BindingSourceType.WORKFLOW_VAR,
                                    SourceReference = "assignedRobotId"
                                },
                                ["targetEndpointId"] = new()
                                {
                                    SourceType = BindingSourceType.CURRENT_MOVEMENT,
                                    SourceReference = "source.endpointId"
                                },
                                ["purpose"] = new()
                                {
                                    SourceType = BindingSourceType.CONSTANT,
                                    ConstantValue = JsonSerializer.SerializeToElement("PICKUP")
                                }
                            }
                        }
                    }
                },
                new
                {
                    taskKey = "DELIVERY",
                    name = "Delivery",
                    sequenceNo = 2,
                    steps = new object[]
                    {
                        new
                        {
                            stepKey = "MOVE_DROPOFF",
                            name = "MOVE_DROPOFF",
                            stepType = StepType.MOVE,
                            operationCode = "DROPOFF",
                            sequenceNo = 1,
                            inputBindings = new Dictionary<string, StepInputBinding>
                            {
                                ["robotId"] = new()
                                {
                                    SourceType = BindingSourceType.WORKFLOW_VAR,
                                    SourceReference = "assignedRobotId"
                                },
                                ["targetEndpointId"] = new()
                                {
                                    SourceType = BindingSourceType.CURRENT_MOVEMENT,
                                    SourceReference = "destination.endpointId"
                                },
                                ["purpose"] = new()
                                {
                                    SourceType = BindingSourceType.CONSTANT,
                                    ConstantValue = JsonSerializer.SerializeToElement("DROPOFF")
                                }
                            }
                        }
                    }
                }
            }
        };

        var create = await Client.PostAsJsonAsync("/api/workflow-execution/workflows", body, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var workflowId = (await create.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
        (await Client.PostAsync($"/api/workflow-execution/workflows/{workflowId}/publish", null)).EnsureSuccessStatusCode();
        return workflowId;
    }
}
