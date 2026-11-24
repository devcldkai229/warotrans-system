using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.WorkflowVisibility;

/// <summary>
/// Which workflows (and their Jobs) a STAFF account sees. A workflow an administrator hid from Staff (robot charging,
/// return to park) is not listed, cannot be opened (404, as if it did not exist) and cannot be requested. ADMIN and
/// TECHNICIAN see everything; a background caller (no account) is not limited.
/// </summary>
public static class StaffWorkflowVisibility
{
    public const string NotAvailableCode = "workflow_not_available";

    public static bool IsLimited(ICurrentUser? user) => user?.Role == AppRoles.Staff;

    /// <summary>Workflows the caller may see.</summary>
    public static IQueryable<Workflow> Visible(this IQueryable<Workflow> workflows, ICurrentUser? user) =>
        IsLimited(user) ? workflows.Where(w => w.StaffVisible) : workflows;

    /// <summary>Jobs the caller may see: for Staff, only Jobs of a workflow shown to Staff.</summary>
    public static IQueryable<Job> Visible(this IQueryable<Job> jobs, WorkflowExecutionDbContext db, ICurrentUser? user) =>
        IsLimited(user) ? jobs.Where(j => db.Workflows.Any(w => w.Id == j.WorkflowId && w.StaffVisible)) : jobs;

    /// <summary>404 for Staff on a hidden workflow, so its existence is not revealed.</summary>
    public static void EnsureVisible(Workflow workflow, ICurrentUser? user)
    {
        if (IsLimited(user) && !workflow.StaffVisible)
        {
            throw new NotFoundException($"Workflow '{workflow.Id}' was not found.", "workflow_not_found");
        }
    }

    public static async Task EnsureJobVisibleAsync(WorkflowExecutionDbContext db, Guid jobId, Guid workflowId, ICurrentUser? user, CancellationToken cancellationToken)
    {
        if (IsLimited(user) && !await db.Workflows.AnyAsync(w => w.Id == workflowId && w.StaffVisible, cancellationToken))
        {
            throw new NotFoundException($"Job '{jobId}' was not found.", "job_not_found");
        }
    }
}

public sealed record SetStaffVisibilityRequest(bool StaffVisible);

public sealed record StaffVisibilityResponse(string Code, bool StaffVisible, int Versions);

/// <summary>An administrator shows or hides a workflow code (every version) from Staff, published or not.</summary>
public sealed class SetStaffVisibilityHandler(WorkflowExecutionDbContext db, IAuditTrail audit)
{
    public async Task<StaffVisibilityResponse> HandleAsync(Guid id, bool staffVisible, CancellationToken cancellationToken)
    {
        var code = await db.Workflows.AsNoTracking().Where(w => w.Id == id).Select(w => w.Code).FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Workflow '{id}' was not found.", "workflow_not_found");
        var versions = await db.Workflows.Where(w => w.Code == code).ToListAsync(cancellationToken);
        var before = versions.All(w => w.StaffVisible);
        foreach (var version in versions)
        {
            version.StaffVisible = staffVisible;
        }

        await db.SaveChangesAsync(cancellationToken);
        if (before != staffVisible)
        {
            await audit.RecordAsync(
                new AuditEntry(
                    "workflow.staff_visibility_changed",
                    "WORKFLOW",
                    id,
                    Before: new Dictionary<string, object?> { ["code"] = code, ["staffVisible"] = before },
                    After: new Dictionary<string, object?> { ["code"] = code, ["staffVisible"] = staffVisible }),
                cancellationToken);
        }

        return new StaffVisibilityResponse(code, staffVisible, versions.Count);
    }
}

public static class SetStaffVisibilityEndpoint
{
    public static RouteGroupBuilder MapSetStaffVisibility(this RouteGroupBuilder group)
    {
        group.MapPut("/workflows/{id:guid}/staff-visibility", async (
                Guid id,
                SetStaffVisibilityRequest request,
                SetStaffVisibilityHandler handler,
                CancellationToken cancellationToken) =>
                Results.Ok(await handler.HandleAsync(id, request.StaffVisible, cancellationToken)))
            .RequirePermission(Permissions.WorkflowWrite)
            .WithName("SetWorkflowStaffVisibility")
            .WithSummary("Show or hide a workflow (every version of its code) and its Jobs from Staff accounts");

        return group;
    }
}

public sealed class JobStaffVisibility(WorkflowExecutionDbContext db) : WaroTrans.WorkflowExecution.Contracts.IJobStaffVisibility
{
    public async Task<bool> IsStaffVisibleAsync(Guid jobId, CancellationToken cancellationToken = default) =>
        await db.Jobs.AsNoTracking()
            .Where(j => j.Id == jobId)
            .Select(j => db.Workflows.Where(w => w.Id == j.WorkflowId).Select(w => (bool?)w.StaffVisible).FirstOrDefault())
            .FirstOrDefaultAsync(cancellationToken) ?? true;
}
