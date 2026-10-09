using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Transportation.Persistence;

namespace WaroTrans.Transportation;

public static class TransportationModule
{
    public static IServiceCollection AddTransportationModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<TransportationDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        return services;
    }

    public static IEndpointRouteBuilder MapTransportationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/transportation");
        group.MapGet("/ping", () => Results.Ok(new { module = "transportation" })).AllowAnonymous();
        return endpoints;
    }
}
