using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Results;

namespace WaroTrans.BuildingBlocks.Authorization;

public static class RobotScopeEndpointExtensions
{
    public static readonly Error RobotOutOfScope =
        Error.Forbidden("robot_out_of_scope", "This robot is not assigned to you.");

    /// <summary>
    /// Rejects the request with 403 <c>robot_out_of_scope</c> when the robot named by the route value
    /// <paramref name="routeValue"/> is outside the caller's <see cref="IRobotAccessScope"/>. Use together with
    /// <see cref="PermissionEndpointExtensions.RequirePermission{TBuilder}"/>: the permission says what, the scope says on which robot.
    /// </summary>
    public static TBuilder RequireRobotScope<TBuilder>(this TBuilder builder, string routeValue = "id")
        where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter(async (context, next) =>
        {
            var raw = context.HttpContext.GetRouteValue(routeValue)?.ToString();
            if (!Guid.TryParse(raw, out var robotId))
            {
                return await next(context);
            }

            var scope = context.HttpContext.RequestServices.GetRequiredService<IRobotAccessScope>();
            return await scope.CanAccessRobotAsync(robotId, context.HttpContext.RequestAborted)
                ? await next(context)
                : RobotOutOfScope.ToProblem();
        });
        return builder;
    }
}
