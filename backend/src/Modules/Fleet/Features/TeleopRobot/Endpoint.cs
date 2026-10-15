using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Fleet.Features.TeleopRobot;

public static class TeleopRobotEndpoint
{
    public static RouteGroupBuilder MapTeleopRobot(this RouteGroupBuilder group)
    {
        group.MapPost("/robots/{id:guid}/teleop", async (
            Guid id,
            TeleopRobotRequest request,
            IValidator<TeleopRobotRequest> validator,
            TeleopRobotHandler handler,
            CancellationToken cancellationToken) =>
        {
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Accepted(value: response);
        });

        return group;
    }
}
