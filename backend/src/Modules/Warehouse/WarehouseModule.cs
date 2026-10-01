using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse;

public static class WarehouseModule
{
    public static IServiceCollection AddWarehouseModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<WarehouseDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        return services;
    }

    public static IEndpointRouteBuilder MapWarehouseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/warehouse");
        group.MapGet("/ping", () => Results.Ok(new { module = "warehouse" }));
        return endpoints;
    }
}
