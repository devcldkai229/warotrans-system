using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.DisableRobot;

public sealed class DisableRobotHandler(FleetDbContext db, IRobotWorkQuery? work = null)
{
    public async Task<RobotResponse> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (robot is null)
        {
            throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");
        }

        // A robot still holding a Job (waiting at a stop, paused) would leave that trip without a robot nobody hands over.
        if (work is not null && await work.HasActiveJobAsync(robot.Id, cancellationToken))
        {
            throw new ConflictException(
                $"Robot {robot.Code} still holds a job; finish, cancel or move that job first.", "robot_has_active_job");
        }

        robot.Disable();
        await db.SaveChangesAsync(cancellationToken);

        return RobotResponse.From(robot);
    }
}
