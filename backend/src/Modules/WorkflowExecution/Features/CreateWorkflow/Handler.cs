using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.WorkflowExecution.Features.CreateWorkflow;

public sealed class CreateWorkflowHandler(
    WorkflowExecutionDbContext db,
    ICurrentUser currentUser)
{
    public async Task<WorkflowDetailDto> HandleAsync(
        CreateWorkflowRequest request,
        CancellationToken cancellationToken)
    {
        var model = WorkflowMapping.ToDefinitionModel(request);
        // Code and keys are not typed by the user: a blank one is made from the name, then checked like any other.
        if (string.IsNullOrWhiteSpace(model.Code) && !string.IsNullOrWhiteSpace(model.Name))
        {
            var prefix = WorkflowKeyGenerator.Slug(model.Name, WorkflowKeyGenerator.MaxCodeLength);
            prefix = prefix.Length == 0 ? WorkflowKeyGenerator.CodeFallback : prefix;
            var used = (await db.Workflows.AsNoTracking()
                    .Where(w => w.Code.StartsWith(prefix))
                    .Select(w => w.Code)
                    .Distinct()
                    .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.Ordinal);
            model.Code = WorkflowKeyGenerator.GenerateCode(model.Name, used.Contains);
        }

        WorkflowKeyGenerator.FillMissingKeys(model);
        WorkflowMapping.ThrowIfInvalid(WorkflowDefinitionValidator.ValidateDraft(model));

        var exists = await db.Workflows.AnyAsync(
            w => w.Code == model.Code && w.VersionNo == 1,
            cancellationToken);
        if (exists)
        {
            throw new ConflictException(
                $"Workflow '{model.Code}' version 1 already exists.",
                "workflow_version_exists");
        }

        var workflow = new Workflow
        {
            Id = Guid.NewGuid(),
            VersionNo = 1,
            Status = WorkflowStatus.DRAFT,
            CreatedBy = currentUser.AccountId ?? Guid.Empty,
            CreatedAt = DateTimeOffset.UtcNow
        };

        WorkflowMapping.ApplyDefinition(workflow, model);
        db.Workflows.Add(workflow);
        await db.SaveChangesAsync(cancellationToken);

        return WorkflowMapping.ToDetail(workflow);
    }
}
