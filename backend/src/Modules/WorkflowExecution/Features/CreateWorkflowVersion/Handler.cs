using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.CreateWorkflowVersion;

public sealed class CreateWorkflowVersionHandler(
    WorkflowExecutionDbContext db,
    ICurrentUser currentUser)
{
    public async Task<WorkflowDetailDto> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var source = await db.Workflows
            .AsNoTracking()
            .Include(w => w.Tasks)
            .ThenInclude(t => t.Steps)
            .FirstOrDefaultAsync(w => w.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Workflow '{id}' was not found.", "workflow_not_found");

        if (source.Status != WorkflowStatus.PUBLISHED)
        {
            throw new ConflictException(
                "Only PUBLISHED workflows can be versioned.",
                "workflow_not_published");
        }

        var nextVersion = source.VersionNo + 1;
        var exists = await db.Workflows.AnyAsync(
            w => w.Code == source.Code && w.VersionNo == nextVersion,
            cancellationToken);
        if (exists)
        {
            throw new ConflictException(
                $"Workflow '{source.Code}' version {nextVersion} already exists.",
                "workflow_version_exists");
        }

        var model = WorkflowMapping.ToDefinitionModel(source);
        var clone = new Workflow
        {
            Id = Guid.NewGuid(),
            VersionNo = nextVersion,
            Status = WorkflowStatus.DRAFT,
            CreatedBy = currentUser.AccountId ?? Guid.Empty,
            CreatedAt = DateTimeOffset.UtcNow
        };

        WorkflowMapping.ApplyDefinition(clone, model);
        db.Workflows.Add(clone);
        await db.SaveChangesAsync(cancellationToken);

        return WorkflowMapping.ToDetail(clone);
    }
}
