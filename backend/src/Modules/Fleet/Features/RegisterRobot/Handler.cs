using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.RegisterRobot;

public sealed class RegisterRobotHandler(
    FleetDbContext db,
    IBusinessCodeGenerator codeGenerator)
{
    public async Task<RobotResponse> HandleAsync(RegisterRobotRequest request, CancellationToken cancellationToken)
    {
        var code = await codeGenerator.NextRobotCodeAsync(cancellationToken);
        var robot = Robot.Register(
            request.WarehouseId,
            request.CurrentMapVersionId,
            code,
            request.Name.Trim(),
            DateTimeOffset.UtcNow);

        db.Robots.Add(robot);
        await db.SaveChangesAsync(cancellationToken);

        return RobotResponse.From(robot);
    }
}
