using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

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
        });

        return group;
    }
}
