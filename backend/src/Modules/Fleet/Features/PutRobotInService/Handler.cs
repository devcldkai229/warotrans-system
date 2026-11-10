using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.PutRobotInService;

public sealed class PutRobotInServiceHandler(FleetDbContext db)
{
    private const int MaxSaveAttempts = 5;

    public async Task<RobotResponse> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await PutInServiceAsync(id, cancellationToken);
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxSaveAttempts)
            {
                // Telemetry (several per second) updated the robot row between read and save: retry from a fresh read.
                db.ChangeTracker.Clear();
            }
        }
    }

    private async Task<RobotResponse> PutInServiceAsync(Guid id, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (robot is null)
        {
            throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");
        }

        robot.PutInService(DateTimeOffset.UtcNow);
        await db.SaveChangesAsync(cancellationToken);

        return RobotResponse.From(robot);
    }
}
