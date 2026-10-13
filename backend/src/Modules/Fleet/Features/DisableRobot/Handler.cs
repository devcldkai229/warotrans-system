using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.DisableRobot;

public sealed class DisableRobotHandler(FleetDbContext db)
{
    public async Task<RobotResponse> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (robot is null)
        {
            throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");
        }

        robot.Disable();
        await db.SaveChangesAsync(cancellationToken);

        return RobotResponse.From(robot);
    }
}
