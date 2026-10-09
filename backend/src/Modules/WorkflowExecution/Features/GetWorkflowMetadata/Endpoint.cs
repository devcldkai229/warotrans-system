using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Registry;

namespace WaroTrans.WorkflowExecution.Features.GetWorkflowMetadata;

public static class GetWorkflowMetadataEndpoint
{
    public static RouteGroupBuilder MapGetWorkflowMetadata(this RouteGroupBuilder group)
    {
        group.MapGet("/metadata/step-types", () =>
        {
            var response = new WorkflowMetadataResponse(
                StepTypeRegistry.All.Select(st => new StepTypeMetadataDto(
                    st.StepType.ToString(),
                    st.Description,
                    st.OperationFieldName,
                    st.Operations.Select(op => new OperationMetadataDto(
                        op.Code,
                        op.Description,
                        op.Inputs.Select(i => new FieldMetadataDto(
                            i.Key,
                            i.DataType.ToString(),
                            i.Required,
                            i.Description,
                            i.AllowedValues)).ToList(),
                        op.Outputs.Select(o => new FieldMetadataDto(
                            o.Key,
                            o.DataType.ToString(),
                            false,
                            o.Description,
                            o.AllowedValues)).ToList())).ToList())).ToList(),
                Enum.GetNames<BindingSourceType>(),
                Enum.GetNames<WorkflowVariableSource>(),
                Enum.GetNames<WorkflowDataType>(),
                Enum.GetNames<StepFailurePolicy>(),
                SystemVariableCatalog.All.Select(s => new CatalogFieldDto(
                    s.Key,
                    s.DataType.ToString(),
                    s.Description)).ToList(),
                CurrentMovementCatalog.All.Select(m => new CatalogFieldDto(
                    m.Path,
                    m.DataType.ToString(),
                    m.Description)).ToList());

            return Results.Ok(response);
        });

        return group;
    }
}

public sealed record WorkflowMetadataResponse(
    IReadOnlyList<StepTypeMetadataDto> StepTypes,
    IReadOnlyList<string> BindingSources,
    IReadOnlyList<string> VariableSources,
    IReadOnlyList<string> DataTypes,
    IReadOnlyList<string> FailurePolicies,
    IReadOnlyList<CatalogFieldDto> SystemVariables,
    IReadOnlyList<CatalogFieldDto> CurrentMovementFields);

public sealed record StepTypeMetadataDto(
    string StepType,
    string Description,
    string OperationFieldName,
    IReadOnlyList<OperationMetadataDto> Operations);

public sealed record OperationMetadataDto(
    string Code,
    string Description,
    IReadOnlyList<FieldMetadataDto> Inputs,
    IReadOnlyList<FieldMetadataDto> Outputs);

public sealed record FieldMetadataDto(
    string Key,
    string DataType,
    bool Required,
    string Description,
    IReadOnlyList<string>? AllowedValues);

public sealed record CatalogFieldDto(
    string Key,
    string DataType,
    string Description);
