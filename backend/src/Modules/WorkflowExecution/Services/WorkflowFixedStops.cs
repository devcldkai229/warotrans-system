using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// A workflow can name the Endpoint where every pickup (or every dropoff) happens: its MOVE PICKUP / MOVE DROPOFF step
/// goes to an Admin-configured variable (e.g. INBOUND → inboundEndpointId = the Inbound gate) or a constant instead of
/// the movement's own source / destination. The robot then drives there whatever the Transport Request says, while
/// stock is booked on the Transport Request's Endpoints; so a request of that workflow must name the same Endpoint.
/// </summary>
public static class WorkflowFixedStops
{
    public sealed record FixedStops(Guid? PickupEndpointId, Guid? DropoffEndpointId);

    public static FixedStops Resolve(WorkflowDefinitionModel model) =>
        new(Find(model, "PICKUP"), Find(model, "DROPOFF"));

    /// <summary>
    /// The fixed stops as Endpoints of <paramref name="mapVersionId"/>: a workflow configured while another map was
    /// published names that map's Endpoint, and the one with the same code is meant. Throws when the map has none.
    /// </summary>
    public static async Task<FixedStops> ResolveOnMapAsync(
        WorkflowDefinitionModel model, Guid mapVersionId, WaroTrans.Navigation.Contracts.INavigationModule? navigation,
        CancellationToken cancellationToken)
    {
        var stops = Resolve(model);
        if (navigation is null || mapVersionId == Guid.Empty) return stops;
        return new FixedStops(
            await OnMapAsync(model, stops.PickupEndpointId, mapVersionId, navigation, cancellationToken),
            await OnMapAsync(model, stops.DropoffEndpointId, mapVersionId, navigation, cancellationToken));
    }

    private static async Task<Guid?> OnMapAsync(
        WorkflowDefinitionModel model, Guid? endpointId, Guid mapVersionId,
        WaroTrans.Navigation.Contracts.INavigationModule navigation, CancellationToken cancellationToken)
    {
        if (endpointId is not { } id) return null;
        var place = await navigation.ResolvePlaceOnMapAsync(id, mapVersionId, cancellationToken);
        if (place is { Found: false })
        {
            throw new DomainValidationException(
                $"Workflow '{model.Code}' stops at '{place.Code}', which is not on this map. Add it to the map (same name) or change the workflow.",
                "workflow_place_not_on_map");
        }

        return place?.TargetId ?? id;
    }

    public static void Ensure(FixedStops stops, string workflowCode, IReadOnlyList<TransportRequestDetailSnapshot> details)
    {
        foreach (var detail in details)
        {
            if (stops.PickupEndpointId is { } pickup && detail.SourceEndpointId != pickup)
            {
                throw new DomainValidationException(
                    $"Detail {detail.SequenceNo}: workflow '{workflowCode}' always picks up at its configured Endpoint; use it as the source.",
                    "workflow_pickup_endpoint_fixed");
            }

            if (stops.DropoffEndpointId is { } dropoff && detail.DestinationEndpointId != dropoff)
            {
                throw new DomainValidationException(
                    $"Detail {detail.SequenceNo}: workflow '{workflowCode}' always delivers to its configured Endpoint; use it as the destination.",
                    "workflow_dropoff_endpoint_fixed");
            }
        }
    }

    public static void Ensure(WorkflowDefinitionModel model, IReadOnlyList<TransportRequestDetailSnapshot> details) =>
        Ensure(Resolve(model), model.Code, details);

    private static Guid? Find(WorkflowDefinitionModel model, string purpose)
    {
        foreach (var step in model.Tasks.SelectMany(t => t.Steps))
        {
            if (step.StepType != StepType.MOVE
                || !string.Equals(step.OperationCode, purpose, StringComparison.OrdinalIgnoreCase)
                || !step.InputBindings.TryGetValue("targetEndpointId", out var binding))
            {
                continue;
            }

            var value = binding.SourceType switch
            {
                BindingSourceType.CONSTANT => binding.ConstantValue,
                BindingSourceType.WORKFLOW_VAR => model.Variables
                    .FirstOrDefault(v => v.Key == binding.SourceReference && v.Source == WorkflowVariableSource.ADMIN_INPUT
                                         && v.Format != WorkflowVariableDefinition.WaypointGroupFormat)
                    ?.ConfiguredValue,
                _ => null
            };
            if (value is { ValueKind: JsonValueKind.String } text && Guid.TryParse(text.GetString(), out var id))
            {
                return id;
            }
        }

        return null;
    }
}
