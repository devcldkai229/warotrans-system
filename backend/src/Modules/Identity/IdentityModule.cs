using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity;

public static class IdentityModule
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<IdentityDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        return services;
    }

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/identity");
        group.MapGet("/ping", () => Results.Ok(new { module = "identity" }));
        return endpoints;
    }
}
