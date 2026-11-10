using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Fleet.Features.RegisterRobot;

public static class RegisterRobotEndpoint
{
    public static RouteGroupBuilder MapRegisterRobot(this RouteGroupBuilder group)
    {
        group.MapPost("/robots", async (
            RegisterRobotRequest request,
            IValidator<RegisterRobotRequest> validator,
            RegisterRobotHandler handler,
            CancellationToken cancellationToken) =>
        {
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/fleet/robots/{response.Id}", response);
        })
            .RequirePermission(Permissions.RobotManage)
            .Audited("robot.registered", "ROBOT", null);

        return group;
    }
}
