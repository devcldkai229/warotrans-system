using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation;

public static class NavigationModule
{
    public static IServiceCollection AddNavigationModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<NavigationDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        return services;
    }

    public static IEndpointRouteBuilder MapNavigationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/navigation");
        group.MapGet("/ping", () => Results.Ok(new { module = "navigation" })).AllowAnonymous();
        return endpoints;
    }
}
