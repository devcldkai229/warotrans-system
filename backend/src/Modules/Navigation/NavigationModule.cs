using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Navigation.Features.ArchiveMapVersion;
using WaroTrans.Navigation.Features.CreateEndpoint;
using WaroTrans.Navigation.Features.CreateMapVersion;
using WaroTrans.Navigation.Features.GetActiveMapVersion;
using WaroTrans.Navigation.Features.GetEndpoint;
using WaroTrans.Navigation.Features.GetMapVersion;
using WaroTrans.Navigation.Features.PublishMapVersion;
using WaroTrans.Navigation.Features.UpdateEndpoint;
using WaroTrans.Navigation.Features.UpdateMapVersion;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation;

public static class NavigationModule
{
    public static IServiceCollection AddNavigationModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<NavigationDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.AddValidatorsFromAssembly(typeof(NavigationModule).Assembly);

        services.AddScoped<CreateMapVersionHandler>();
        services.AddScoped<UpdateMapVersionHandler>();
        services.AddScoped<GetMapVersionHandler>();
        services.AddScoped<GetActiveMapVersionHandler>();
        services.AddScoped<PublishMapVersionHandler>();
        services.AddScoped<ArchiveMapVersionHandler>();
        services.AddScoped<CreateEndpointHandler>();
        services.AddScoped<GetEndpointHandler>();
        services.AddScoped<UpdateEndpointHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapNavigationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/navigation");
        group.MapGet("/ping", () => Results.Ok(new { module = "navigation" })).AllowAnonymous();

        CreateMapVersionEndpoint.Map(group);
        UpdateMapVersionEndpoint.Map(group);
        GetMapVersionEndpoint.Map(group);
        GetActiveMapVersionEndpoint.Map(group);
        PublishMapVersionEndpoint.Map(group);
        ArchiveMapVersionEndpoint.Map(group);
        CreateEndpointEndpoint.Map(group);
        GetEndpointEndpoint.Map(group);
        UpdateEndpointEndpoint.Map(group);

        return endpoints;
    }
}
