using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.Shared;

/// <summary>
/// BOTH-06: names for the ids a Job list shows, read in one batch from the modules that own them. A robot outside the
/// caller's scope stays hidden: neither its id nor its code is returned.
/// </summary>
public sealed class JobSummaryEnricher(
    WorkflowExecutionDbContext db,
    IFleetModule fleet,
    IWarehouseModule warehouse,
    ITransportRequestCodeLookup requests,
    IRobotAccessScope robotScope,
    INavigationModule navigation)
{
    public async Task<IReadOnlyList<JobSummaryDto>> EnrichAsync(
        IReadOnlyList<JobSummaryDto> items,
        CancellationToken cancellationToken)
    {
        if (items.Count == 0)
        {
            return items;
        }

        var jobIds = items.Select(j => j.Id).ToList();
        var workflowIds = items.Select(j => j.WorkflowId).Distinct().ToList();
        var workflows = await db.Workflows.AsNoTracking()
            .Where(w => workflowIds.Contains(w.Id))
            .ToDictionaryAsync(w => w.Id, w => w.Name, cancellationToken);
        var containers = await db.JobContainers.AsNoTracking()
            .Where(c => jobIds.Contains(c.JobId))
            .Select(c => new { c.JobId, c.ContainerId, c.SequenceNo })
            .ToListAsync(cancellationToken);
        var barcodes = (await warehouse.GetContainersAsync(containers.Select(c => c.ContainerId).Distinct().ToList(), cancellationToken))
            .ToDictionary(c => c.Id, c => c.Barcode);
        var requestIds = items.SelectMany(j => j.TransportRequestIds).Distinct().ToList();
        var codes = await requests.GetCodesAsync(requestIds, cancellationToken);
        // How many trips each request has (a request split over several robot loads).
        var tripCounts = (await db.JobContainers.AsNoTracking()
                .Where(c => requestIds.Contains(c.TransportRequestId))
                .Select(c => new { c.TransportRequestId, c.JobId })
                .Distinct()
                .ToListAsync(cancellationToken))
            .GroupBy(x => x.TransportRequestId)
            .ToDictionary(g => g.Key, g => g.Count());
        var endpointCodes = new Dictionary<Guid, string?>();
        foreach (var endpointId in items.SelectMany(j => j.Stops ?? []).Select(s => s.EndpointId).Distinct())
        {
            endpointCodes[endpointId] = (await navigation.GetEndpointPoseAsync(endpointId, cancellationToken))?.Code;
        }

        var scope = await robotScope.GetCurrentAsync(cancellationToken);
        var robotCodes = new Dictionary<Guid, string?>();
        foreach (var robotId in items.Select(j => j.AssignedRobotId).OfType<Guid>().Distinct().Where(scope.Allows))
        {
            robotCodes[robotId] = (await fleet.GetRobotAsync(robotId, cancellationToken))?.Code;
        }

        return items.Select(job => job with
        {
            AssignedRobotId = job.AssignedRobotId is { } id && scope.Allows(id) ? id : null,
            RobotCode = job.AssignedRobotId is { } robot ? robotCodes.GetValueOrDefault(robot) : null,
            WorkflowName = workflows.GetValueOrDefault(job.WorkflowId),
            RequestCodes = job.TransportRequestIds.Select(r => codes.GetValueOrDefault(r)).OfType<string>().ToList(),
            ContainerBarcodes = containers.Where(c => c.JobId == job.Id)
                .OrderBy(c => c.SequenceNo)
                .Select(c => barcodes.GetValueOrDefault(c.ContainerId))
                .OfType<string>()
                .ToList(),
            TripCount = job.TransportRequestIds.Count == 1 ? tripCounts.GetValueOrDefault(job.TransportRequestIds[0]) : null,
            Stops = job.Stops?.Select(s => s with { EndpointCode = endpointCodes.GetValueOrDefault(s.EndpointId) }).ToList(),
            Containers = job.Containers?.Select(c => c with { Barcode = barcodes.GetValueOrDefault(c.ContainerId) }).ToList()
        }).ToList();
    }
}
