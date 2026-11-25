using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Services;

/// <summary>The places a workflow names itself, and its fixed stops on the request's map (same code).</summary>
public sealed class WorkflowPlacesTests
{
    private static readonly Guid Inbound = Guid.NewGuid();
    private static readonly Guid Parking = Guid.NewGuid();
    private static readonly Guid Gate = Guid.NewGuid();

    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);

    [Fact]
    public void Collects_admin_waypoints_groups_and_constant_endpoint_inputs_only()
    {
        var workflow = new Workflow
        {
            Code = "INBOUND",
            VariablesSchema =
            [
                new() { Key = "inboundEndpointId", Name = "Inbound gate", DataType = WorkflowDataType.UUID, Source = WorkflowVariableSource.ADMIN_INPUT, ConfiguredValue = Json(Inbound) },
                new() { Key = "parking", Name = "Parking", DataType = WorkflowDataType.UUID, Format = WorkflowVariableDefinition.WaypointGroupFormat, Source = WorkflowVariableSource.ADMIN_INPUT, ConfiguredValue = Json(Parking) },
                new() { Key = "note", DataType = WorkflowDataType.STRING, Source = WorkflowVariableSource.ADMIN_INPUT, ConfiguredValue = Json("x") },
                new() { Key = "otherId", DataType = WorkflowDataType.UUID, Source = WorkflowVariableSource.ADMIN_INPUT, ConfiguredValue = Json(Guid.NewGuid()) },
                new() { Key = "staffEndpointId", DataType = WorkflowDataType.UUID, Source = WorkflowVariableSource.STAFF_INPUT },
            ],
            Tasks =
            [
                new WorkflowTask
                {
                    Steps =
                    [
                        new WorkflowStep
                        {
                            Name = "Go to gate", SequenceNo = 1,
                            InputBindings = new()
                            {
                                ["targetEndpointId"] = new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = Json(Gate) },
                                ["robotId"] = new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = Json(Guid.NewGuid()) },
                            }
                        },
                        new WorkflowStep
                        {
                            Name = "Go to source", SequenceNo = 2,
                            InputBindings = new() { ["targetEndpointId"] = new() { SourceType = BindingSourceType.CURRENT_MOVEMENT, SourceReference = "source.endpointId" } }
                        }
                    ]
                }
            ]
        };

        var places = WorkflowPlaces.Collect(workflow);

        Assert.Equal([Inbound, Parking, Gate], places.Select(p => p.PlaceId));
        Assert.Equal(["Inbound gate", "Parking", "Go to gate · targetEndpointId"], places.Select(p => p.Where));
        // The parking group is a preference no step drives to (robot care falls back to any PARK endpoint).
        Assert.Equal([false, true, false], places.Select(p => p.Hint));
    }

    private sealed class Navigation(Dictionary<Guid, MapPlaceResolution> places) : INavigationModule
    {
        public Task<MapVersionSnapshot?> GetMapVersionAsync(Guid mapVersionId, CancellationToken cancellationToken = default) => Task.FromResult<MapVersionSnapshot?>(null);
        public Task<IReadOnlyList<EndpointSnapshot>> GetEndpointsAsync(IReadOnlyCollection<Guid> endpointIds, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<EndpointSnapshot>>([]);
        public Task<EndpointPoseSnapshot?> GetEndpointPoseByCodeAsync(Guid mapVersionId, string code, CancellationToken cancellationToken = default) => Task.FromResult<EndpointPoseSnapshot?>(null);
        public Task<EndpointPoseSnapshot?> GetEndpointPoseAsync(Guid endpointId, CancellationToken cancellationToken = default) => Task.FromResult<EndpointPoseSnapshot?>(null);

        public Task<MapPlaceResolution?> ResolvePlaceOnMapAsync(Guid id, Guid mapVersionId, CancellationToken cancellationToken = default) =>
            Task.FromResult(places.TryGetValue(id, out var r) ? r : null);
    }

    private static WorkflowDefinitionModel Fixed(Guid pickup) => new()
    {
        Code = "INBOUND",
        Variables = [],
        Tasks =
        [
            new WorkflowTaskModel
            {
                TaskKey = "COLLECT", SequenceNo = 1,
                Steps = [new WorkflowStepModel { StepKey = "MOVE_PICKUP", StepType = StepType.MOVE, OperationCode = "PICKUP", InputBindings = new() { ["targetEndpointId"] = new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = Json(pickup) } } }]
            }
        ]
    };

    [Fact]
    public async Task A_fixed_stop_configured_on_an_older_map_is_its_same_code_endpoint_on_the_request_map()
    {
        var onNewMap = Guid.NewGuid();
        var nav = new Navigation(new() { [Inbound] = new MapPlaceResolution(Inbound, false, "EP-INBOUND", onNewMap) });

        var stops = await WorkflowFixedStops.ResolveOnMapAsync(Fixed(Inbound), Guid.NewGuid(), nav, default);

        Assert.Equal(onNewMap, stops.PickupEndpointId);
        Assert.Null(stops.DropoffEndpointId);
    }

    [Fact]
    public async Task A_fixed_stop_the_request_map_lacks_is_refused_with_its_code()
    {
        var nav = new Navigation(new() { [Inbound] = new MapPlaceResolution(Inbound, false, "EP-INBOUND", null) });

        var error = await Assert.ThrowsAsync<DomainValidationException>(() =>
            WorkflowFixedStops.ResolveOnMapAsync(Fixed(Inbound), Guid.NewGuid(), nav, default));

        Assert.Equal("workflow_place_not_on_map", error.Code);
        Assert.Contains("EP-INBOUND", error.Message);
    }
}
