using WaroTrans.Transportation.Entities;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Features.Shared;

/// <summary>
/// The single mapping from a TransportRequest to the WorkflowExecution snapshot contract.
/// </summary>
public static class TransportRequestSnapshotMapper
{
    public static TransportRequestExecutionSnapshot ToExecutionSnapshot(TransportRequest request) =>
        new(
            request.Id,
            request.WarehouseId,
            request.MapVersionId,
            request.WorkflowId,
            request.PlanSchemaVersion,
            request.WorkflowInputs ?? [],
            request.Details
                .OrderBy(d => d.SequenceNo)
                .Select(d => new TransportRequestDetailSnapshot(
                    d.Id,
                    d.SequenceNo,
                    d.ContainerId,
                    d.SourceStorageLocationId,
                    d.SourceEndpointId,
                    d.SourceLevelNo,
                    d.DestinationStorageLocationId,
                    d.DestinationEndpointId,
                    d.DestinationLevelNo))
                .ToList());
}
