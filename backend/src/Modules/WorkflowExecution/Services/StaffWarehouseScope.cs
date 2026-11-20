using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>V1 Staff share the active warehouse with the newest published map.</summary>
public sealed class StaffWarehouseScope(
    WorkflowExecutionDbContext db,
    INavigationModule navigation,
    IWarehouseModule warehouse) : IStaffOperatingWarehouse
{
    public async Task<Guid?> GetOperatingWarehouseIdAsync(CancellationToken cancellationToken)
    {
        var maps = await navigation.GetPublishedMapsAsync(cancellationToken);
        foreach (var id in maps.Select(map => map.WarehouseId).Distinct())
        {
            if (await warehouse.GetWarehouseAsync(id, cancellationToken) is { IsActive: true })
                return id;
        }

        return null;
    }

    public async Task<string?> JobDenialAsync(Guid mapVersionId, ICurrentUser user, CancellationToken cancellationToken)
    {
        if (user.Role != AppRoles.Staff) return null;

        var operatingWarehouseId = await GetOperatingWarehouseIdAsync(cancellationToken);
        if (operatingWarehouseId is null) return "staff_warehouse_unavailable";

        var jobMap = await navigation.GetMapVersionAsync(mapVersionId, cancellationToken);
        return jobMap?.WarehouseId == operatingWarehouseId ? null : "job_outside_staff_warehouse";
    }

    public async Task<IReadOnlySet<Guid>> VisibleMapIdsAsync(
        IEnumerable<Guid> mapVersionIds, ICurrentUser user, CancellationToken cancellationToken)
    {
        var ids = mapVersionIds.ToHashSet();
        if (user.Role != AppRoles.Staff || ids.Count == 0) return ids;

        var visible = new HashSet<Guid>();
        if (await GetOperatingWarehouseIdAsync(cancellationToken) is not { } warehouseId) return visible;
        foreach (var id in ids)
        {
            if ((await navigation.GetMapVersionAsync(id, cancellationToken))?.WarehouseId == warehouseId)
                visible.Add(id);
        }

        return visible;
    }

    public async Task EnsureJobAccessAsync(Guid jobId, ICurrentUser user, CancellationToken cancellationToken)
    {
        if (user.Role != AppRoles.Staff) return;

        var mapVersionId = await db.Jobs.AsNoTracking()
            .Where(job => job.Id == jobId)
            .Select(job => (Guid?)job.MapVersionId)
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Job '{jobId}' was not found.", "job_not_found");

        await EnsureMapAccessAsync(mapVersionId, user, cancellationToken);
    }

    public async Task EnsureStepAccessAsync(Guid jobStepId, ICurrentUser user, CancellationToken cancellationToken)
    {
        if (user.Role != AppRoles.Staff) return;

        var mapVersionId = await db.JobSteps.AsNoTracking()
            .Where(step => step.Id == jobStepId)
            .Select(step => (Guid?)step.JobTask.Job.MapVersionId)
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"JobStep '{jobStepId}' was not found.", "job_step_not_found");

        await EnsureMapAccessAsync(mapVersionId, user, cancellationToken);
    }

    private async Task EnsureMapAccessAsync(Guid mapVersionId, ICurrentUser user, CancellationToken cancellationToken)
    {
        if (await JobDenialAsync(mapVersionId, user, cancellationToken) is { } reason)
        {
            var message = reason == "staff_warehouse_unavailable"
                ? "Publish a map for an active warehouse before Staff can operate Jobs."
                : "This Job belongs to a different warehouse from the current Staff warehouse.";
            throw new AppException(message, 403, reason);
        }
    }
}
