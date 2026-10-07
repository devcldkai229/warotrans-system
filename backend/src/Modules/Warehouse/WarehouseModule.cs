using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Features.GetContainer;
using WaroTrans.Warehouse.Features.GetProductInventoryContext;
using WaroTrans.Warehouse.Features.ResolveProduct;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse;

public static class WarehouseModule
{
    public static IServiceCollection AddWarehouseModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<WarehouseDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.AddValidatorsFromAssembly(typeof(WarehouseModule).Assembly);

        services.AddScoped<ResolveProductHandler>();
        services.AddScoped<CreateContainerHandler>();
        services.AddScoped<GetContainerHandler>();
        services.AddScoped<GetProductInventoryContextHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapWarehouseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/warehouse");
        group.MapGet("/ping", () => Results.Ok(new { module = "warehouse" }));

        var protectedGroup = group.MapGroup(string.Empty)
            .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin);

        ResolveProductEndpoint.Map(protectedGroup);
        CreateContainerEndpoint.Map(protectedGroup);
        GetContainerEndpoint.Map(protectedGroup);
        GetProductInventoryContextEndpoint.Map(protectedGroup);

        return endpoints;
    }
}
