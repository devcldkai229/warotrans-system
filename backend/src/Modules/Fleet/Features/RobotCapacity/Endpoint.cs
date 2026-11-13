using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.RobotCapacity;

/// <summary>Any field left null means it is not known.</summary>
public sealed record SetRobotCapacityRequest(decimal? MaxPayloadKg, int? MaxContainers, double? LengthM, double? WidthM);

/// <summary>FL-03: what this robot may carry and how big it is, as measured by a person.</summary>
public static class RobotCapacityEndpoint
{
    public static RouteGroupBuilder MapSetRobotCapacity(this RouteGroupBuilder group)
    {
        group.MapPut("/robots/{id:guid}/capacity", async (
                Guid id, SetRobotCapacityRequest request, FleetDbContext db, TimeProvider clock, CancellationToken cancellationToken) =>
            {
                if (request.MaxPayloadKg is <= 0 || request.MaxContainers is <= 0 || request.LengthM is <= 0 || request.WidthM is <= 0)
                {
                    throw new DomainValidationException("Capacity and size must be above zero, or empty when not known.", "robot_capacity_invalid");
                }

                if (request.MaxContainers > WaroTrans.BuildingBlocks.RobotLoad.MaxContainers)
                {
                    throw new DomainValidationException(
                        $"A robot carries at most {WaroTrans.BuildingBlocks.RobotLoad.MaxContainers} containers.",
                        "robot_capacity_above_limit");
                }

                var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
                    ?? throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");
                robot.MaxPayloadKg = request.MaxPayloadKg;
                robot.MaxContainers = request.MaxContainers;
                robot.LengthM = request.LengthM;
                robot.WidthM = request.WidthM;
                robot.UpdatedAt = clock.GetUtcNow();
                await db.SaveChangesAsync(cancellationToken);
                return Results.Ok(RobotResponse.From(robot));
            })
            .RequirePermission(Permissions.RobotConfigure)
            .RequireRobotScope()
            .Audited("robot.capacity_set", "ROBOT", "id")
            .WithName("SetRobotCapacity")
            .WithSummary("Set what a robot may carry and its size")
            .WithTags("Robots");

        return group;
    }
}
