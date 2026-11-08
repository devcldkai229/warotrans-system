using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace WaroTrans.BuildingBlocks.Authorization;

public sealed record PermissionRequirement(string Permission) : IAuthorizationRequirement;

internal sealed class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (RolePermissionMatrix.UserHas(context.User, requirement.Permission))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}

public static class PermissionPolicies
{
    public const string Prefix = "perm:";

    public static string For(string permission) => Prefix + permission;

    /// <summary>Registers one policy per entry of <see cref="Permissions.All"/> and the handler that evaluates them.</summary>
    public static IServiceCollection AddPermissionAuthorization(this IServiceCollection services)
    {
        services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();
        services.Configure<AuthorizationOptions>(options =>
        {
            foreach (var permission in Permissions.All)
            {
                options.AddPolicy(For(permission), policy => policy
                    .RequireAuthenticatedUser()
                    .AddRequirements(new PermissionRequirement(permission)));
            }
        });
        return services;
    }
}

public static class PermissionEndpointExtensions
{
    /// <summary>The caller's role must hold <paramref name="permission"/> (see <see cref="RolePermissionMatrix"/>).</summary>
    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, string permission)
        where TBuilder : IEndpointConventionBuilder
    {
        if (!Permissions.All.Contains(permission))
        {
            throw new ArgumentException($"Unknown permission '{permission}'.", nameof(permission));
        }

        return builder.RequireAuthorization(PermissionPolicies.For(permission));
    }
}
