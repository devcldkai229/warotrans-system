using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Registry;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.WorkflowExecution.Services;

public sealed class WorkflowRequestValidator(WorkflowExecutionDbContext db) : IWorkflowRequestValidator
{
    public async Task ValidateAsync(
        Guid workflowId,
        TransportRequestExecutionSnapshot request,
        CancellationToken cancellationToken = default)
    {
        if (workflowId == Guid.Empty || request.WorkflowId == Guid.Empty)
        {
            throw new DomainValidationException("WorkflowId is required.", "workflow_id_required");
        }

        if (workflowId != request.WorkflowId)
        {
            throw new DomainValidationException(
                "workflowId argument must match snapshot.WorkflowId.",
                "workflow_id_mismatch");
        }

        if (request.TransportRequestId == Guid.Empty)
        {
            throw new DomainValidationException("TransportRequestId is required.", "transport_request_id_required");
        }

        if (request.WarehouseId == Guid.Empty)
        {
            throw new DomainValidationException("WarehouseId is required.", "warehouse_id_required");
        }

        if (request.MapVersionId == Guid.Empty)
        {
            throw new DomainValidationException("MapVersionId is required.", "map_version_id_required");
        }

        if (request.Details.Count == 0)
        {
            throw new DomainValidationException(
                "At least one TransportRequestDetail is required.",
                "details_required");
        }

        var containerIds = new HashSet<Guid>();
        foreach (var detail in request.Details)
        {
            if (detail.ContainerId == Guid.Empty)
            {
                throw new DomainValidationException(
                    $"Detail sequence {detail.SequenceNo} has empty ContainerId.",
                    "detail_container_required");
            }

            if (!containerIds.Add(detail.ContainerId))
            {
                throw new DomainValidationException(
                    $"Duplicate ContainerId '{detail.ContainerId}' in the same TransportRequest is not allowed in V1.",
                    "duplicate_container_in_request");
            }

            if (detail.SourceEndpointId == Guid.Empty)
            {
                throw new DomainValidationException(
                    $"Detail for container '{detail.ContainerId}' requires SourceEndpointId.",
                    "detail_source_endpoint_required");
            }

            if (detail.DestinationEndpointId == Guid.Empty)
            {
                throw new DomainValidationException(
                    $"Detail for container '{detail.ContainerId}' requires DestinationEndpointId.",
                    "detail_destination_endpoint_required");
            }

            if (detail.SourceLevelNo is not null && detail.SourceStorageLocationId is null)
            {
                throw new DomainValidationException(
                    $"Detail for container '{detail.ContainerId}' has SourceLevelNo without SourceStorageLocationId.",
                    "detail_source_level_requires_storage");
            }

            if (detail.DestinationLevelNo is not null && detail.DestinationStorageLocationId is null)
            {
                throw new DomainValidationException(
                    $"Detail for container '{detail.ContainerId}' has DestinationLevelNo without DestinationStorageLocationId.",
                    "detail_destination_level_requires_storage");
            }
        }

        var workflow = await db.Workflows
            .AsNoTracking()
            .Include(w => w.Tasks)
            .ThenInclude(t => t.Steps)
            .FirstOrDefaultAsync(w => w.Id == workflowId, cancellationToken)
            ?? throw new NotFoundException($"Workflow '{workflowId}' was not found.", "workflow_not_found");

        if (workflow.Status != WorkflowStatus.PUBLISHED)
        {
            throw new DomainValidationException(
                $"Workflow '{workflow.Code}' must be PUBLISHED (current: {workflow.Status}).",
                "workflow_not_published");
        }

        var model = WorkflowMapping.ToDefinitionModel(workflow);
        var inputs = request.WorkflowInputs ?? new Dictionary<string, JsonElement>();

        foreach (var variable in model.Variables.Where(v => v.Source == WorkflowVariableSource.STAFF_INPUT))
        {
            if (!inputs.TryGetValue(variable.Key, out var value)
                || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            {
                if (variable.IsRequired && variable.DefaultValue is null)
                {
                    throw new DomainValidationException(
                        $"Required STAFF_INPUT '{variable.Key}' is missing.",
                        "staff_input_missing");
                }

                continue;
            }

            if (!WorkflowDataTypeCompatibility.TryParse(value, variable.DataType, out var typeError))
            {
                throw new DomainValidationException(
                    $"STAFF_INPUT '{variable.Key}' type mismatch: {typeError}",
                    "staff_input_type_mismatch");
            }
        }

        var schema = RequestInputSchemaBuilder.Build(model);
        foreach (var movement in schema.MovementInputs.Where(m => m.Required))
        {
            foreach (var detail in request.Details)
            {
                if (!DetailHasMovementPath(detail, movement.Key))
                {
                    throw new DomainValidationException(
                        $"Detail for container '{detail.ContainerId}' is missing required CURRENT_MOVEMENT field '{movement.Key}'.",
                        "movement_field_missing");
                }
            }
        }
    }

    private static bool DetailHasMovementPath(TransportRequestDetailSnapshot detail, string path) =>
        path switch
        {
            "containerId" => detail.ContainerId != Guid.Empty,
            "transportRequestDetailId" => detail.DetailId != Guid.Empty,
            "source.endpointId" => detail.SourceEndpointId != Guid.Empty,
            "source.storageLocationId" => detail.SourceStorageLocationId is not null,
            "source.levelNo" => detail.SourceLevelNo is not null,
            "destination.endpointId" => detail.DestinationEndpointId != Guid.Empty,
            "destination.storageLocationId" => detail.DestinationStorageLocationId is not null,
            "destination.levelNo" => detail.DestinationLevelNo is not null,
            "jobContainerId" => true, // provision-time only
            _ => CurrentMovementCatalog.TryGet(path, out _)
        };
}
