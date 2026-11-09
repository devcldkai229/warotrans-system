using System.Net;
using WaroTrans.BuildingBlocks.Enums;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.IntegrationTests.Transportation;

/// <summary>A warehouse with a published map, two storage locations, one container and a published two-move workflow.</summary>
internal static class TransportRequestScenario
{
    private const string Route = "/api/transportation/transport-requests";
    private static readonly Guid TestAccountId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private sealed record IdDto(Guid Id);

    /// <summary>Submits a one-container request; returns its id.</summary>
    public static async Task<Guid> SubmitAsync(HttpClient client, Seed seed, Guid workflowId)
    {
        var create = await client.PostAsJsonAsync(Route, new
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
        return (await create.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
    }

    public sealed record Seed(
        Guid WarehouseId,
        Guid MapVersionId,
        Guid SourceEndpointId,
        Guid DestinationEndpointId,
        Guid SourceLocationId,
        Guid DestinationLocationId,
        Guid ContainerId);

    public static async Task<Seed> SeedAsync(IServiceProvider services, HttpClient client, string barcode)
    {
        var warehouseId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var containerId = Guid.NewGuid();
        var sourceLocationId = Guid.NewGuid();
        var destinationLocationId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        await using (var scope = services.CreateAsyncScope())
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

        var mapResponse = await client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{warehouseId}/maps",
            new { name = "Map", mapUri = "http://storage/map.yaml", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        mapResponse.EnsureSuccessStatusCode();
        var mapId = (await mapResponse.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;

        var sourceEndpointId = await CreateEndpointAsync(client, mapId, "Source Shelf");
        var destinationEndpointId = await CreateEndpointAsync(client, mapId, "Destination Shelf");
        (await client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        await using (var scope = services.CreateAsyncScope())
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
                Barcode = barcode,
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

    private static async Task<Guid> CreateEndpointAsync(HttpClient client, Guid mapId, string name)
    {
        var response = await client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", new
        {
            name,
            endpointType = "WAYPOINT",
            x = 1.0,
            y = 2.0,
            yaw = 0.0,
            positionTolerance = 0.1,
            yawTolerance = 0.2
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
    }

    public static async Task<Guid> CreatePublishedWorkflowAsync(HttpClient client)
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

        var create = await client.PostAsJsonAsync("/api/workflow-execution/workflows", body, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var workflowId = (await create.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
        (await client.PostAsync($"/api/workflow-execution/workflows/{workflowId}/publish", null)).EnsureSuccessStatusCode();
        return workflowId;
    }
}
