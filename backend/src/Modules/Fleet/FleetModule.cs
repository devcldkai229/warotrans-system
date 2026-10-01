using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet;

public static class FleetModule
{
    public static IServiceCollection AddFleetModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<FleetDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        return services;
    }

    public static IEndpointRouteBuilder MapFleetEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/fleet");
        group.MapGet("/ping", () => Results.Ok(new { module = "fleet" }));
        return endpoints;
    }
}
