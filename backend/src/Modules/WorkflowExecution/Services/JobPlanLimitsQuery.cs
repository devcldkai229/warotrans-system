using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.WorkflowExecution.Services;

public sealed class JobPlanLimitsQuery(IFleetModule fleet, IWarehouseModule warehouse) : IJobPlanLimitsQuery
{
    public async Task<JobPlanLimits> GetAsync(TransportRequestExecutionSnapshot request, CancellationToken cancellationToken = default)
    {
        var capacity = await fleet.GetCapacityAsync(request.MapVersionId, cancellationToken);
        var containers = await warehouse.GetContainersAsync(request.Details.Select(d => d.ContainerId).ToList(), cancellationToken);
        var weights = containers.Where(c => c.WeightKg is not null).ToDictionary(c => c.Id, c => c.WeightKg!.Value);

        if (capacity.LargestPayloadKg is { } largest
            && containers.FirstOrDefault(c => c.WeightKg > largest) is { } tooHeavy)
        {
            throw new ConflictException(
                $"Container {tooHeavy.Barcode} weighs {tooHeavy.WeightKg} kg; no robot on this map can carry more than {largest} kg.",
                "no_robot_can_carry");
        }

        return new JobPlanLimits(capacity.LargestMaxContainers, capacity.LargestPayloadKg, weights);
    }
}
