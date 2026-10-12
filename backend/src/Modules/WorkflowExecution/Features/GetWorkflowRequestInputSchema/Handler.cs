using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.WorkflowExecution.Features.GetWorkflowRequestInputSchema;

public sealed class GetWorkflowRequestInputSchemaHandler(WorkflowExecutionDbContext db)
{
    public async Task<WorkflowRequestInputSchemaDto> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var workflow = await db.Workflows
            .AsNoTracking()
            .Include(w => w.Tasks)
            .ThenInclude(t => t.Steps)
            .FirstOrDefaultAsync(w => w.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Workflow '{id}' was not found.", "workflow_not_found");

        var model = WorkflowMapping.ToDefinitionModel(workflow);
        var schema = RequestInputSchemaBuilder.Build(model);

        return new WorkflowRequestInputSchemaDto(
            workflow.Id,
            schema.WorkflowInputs.Select(f => new RequestInputFieldDto(
                f.Key,
                f.DataType,
                f.Required,
                f.Label,
                f.Description)).ToList(),
            schema.MovementInputs.Select(f => new RequestInputFieldDto(
                f.Key,
                f.DataType,
                f.Required,
                f.Label,
                f.Description)).ToList());
    }
}

public sealed record WorkflowRequestInputSchemaDto(
    Guid WorkflowId,
    IReadOnlyList<RequestInputFieldDto> WorkflowInputs,
    IReadOnlyList<RequestInputFieldDto> MovementInputs);

public sealed record RequestInputFieldDto(
    string Key,
    string DataType,
    bool Required,
    string Label,
    string? Description);
