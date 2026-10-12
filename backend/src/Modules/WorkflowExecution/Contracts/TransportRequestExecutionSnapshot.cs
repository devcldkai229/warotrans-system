using System.Text.Json;

namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>
/// Cross-module DTO. Transportation builds this; WorkflowExecution never receives EF entities.
/// </summary>
public sealed record TransportRequestExecutionSnapshot(
    Guid TransportRequestId,
    Guid WarehouseId,
    Guid MapVersionId,
    Guid WorkflowId,
    int PlanSchemaVersion,
    IReadOnlyDictionary<string, JsonElement> WorkflowInputs,
    IReadOnlyList<TransportRequestDetailSnapshot> Details);
