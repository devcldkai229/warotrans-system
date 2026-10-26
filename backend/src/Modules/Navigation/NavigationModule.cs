using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Features.ArchiveMapVersion;
using WaroTrans.Navigation.Features.CloneMapVersion;
using WaroTrans.Navigation.Features.CreateEdge;
using WaroTrans.Navigation.Features.CreateEndpoint;
using WaroTrans.Navigation.Features.CreateMapVersion;
using WaroTrans.Navigation.Features.CreateZone;
using WaroTrans.Navigation.Features.DeleteEdge;
using WaroTrans.Navigation.Features.DeleteEndpoint;
using WaroTrans.Navigation.Features.DeleteZone;
using WaroTrans.Navigation.Features.GetActiveMapVersion;
using WaroTrans.Navigation.Features.GetEdge;
using WaroTrans.Navigation.Features.GetEndpoint;
using WaroTrans.Navigation.Features.GetMapVersion;
using WaroTrans.Navigation.Features.GetRouteGraph;
using WaroTrans.Navigation.Features.GetTrafficGraphDebugSvg;
using WaroTrans.Navigation.Features.GetTrafficGraphValidation;
using WaroTrans.Navigation.Features.GetZone;
using WaroTrans.Navigation.Features.ImportMapVersion;
using WaroTrans.Navigation.Features.PublishMapVersion;
using WaroTrans.Navigation.Features.UpdateEdge;
using WaroTrans.Navigation.Features.UpdateEndpoint;
using WaroTrans.Navigation.Features.UpdateMapVersion;
using WaroTrans.Navigation.Features.UpdateZone;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Navigation;

public static class NavigationModule
{
    public static IServiceCollection AddNavigationModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<NavigationDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.Configure<MapAssetStorageOptions>(
            configuration.GetSection(MapAssetStorageOptions.SectionName));

        // Footprint defaults match Nav2 0.32×0.26 + 0.02 padding (see calibration / geometry.yaml).
        services.Configure<TrafficFootprintOptions>(
            configuration.GetSection(TrafficFootprintOptions.SectionName));

        services.AddValidatorsFromAssembly(typeof(NavigationModule).Assembly);

        services.AddSingleton<CompiledTrafficGraphCache>();
        services.AddScoped<TrafficGraphCompileService>();

        services.AddScoped<CreateMapVersionHandler>();
        services.AddScoped<UpdateMapVersionHandler>();
        services.AddScoped<GetMapVersionHandler>();
        services.AddScoped<GetRouteGraphHandler>();
        services.AddScoped<GetTrafficGraphValidationHandler>();
        services.AddScoped<GetTrafficGraphDebugSvgHandler>();
        services.AddScoped<GetActiveMapVersionHandler>();
        services.AddScoped<PublishMapVersionHandler>();
        services.AddScoped<ArchiveMapVersionHandler>();
        services.AddScoped<CreateEndpointHandler>();
        services.AddScoped<GetEndpointHandler>();
        services.AddScoped<UpdateEndpointHandler>();
        services.AddScoped<DeleteEndpointHandler>();
        services.AddScoped<CreateEdgeHandler>();
        services.AddScoped<GetEdgeHandler>();
        services.AddScoped<UpdateEdgeHandler>();
        services.AddScoped<DeleteEdgeHandler>();
        services.AddScoped<CreateZoneHandler>();
        services.AddScoped<GetZoneHandler>();
        services.AddScoped<UpdateZoneHandler>();
        services.AddScoped<DeleteZoneHandler>();
        services.AddScoped<ImportMapVersionHandler>();
        services.AddScoped<CloneMapVersionHandler>();
        RegisterMapAssetStore(services, configuration);

        services.AddScoped<INavigationModule, NavigationModuleApi>();
        services.AddScoped<WaroTrans.Warehouse.Contracts.IMapEndpointCatalog, MapEndpointCatalog>();

        return services;
    }

    private static void RegisterMapAssetStore(IServiceCollection services, IConfiguration configuration)
    {
        var provider = configuration.GetSection(MapAssetStorageOptions.SectionName).GetValue<string>("Provider")
            ?? "Local";

        if (string.Equals(provider, "S3", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IMapAssetStore, S3MapAssetStore>();
        }
        else
        {
            services.AddSingleton<IMapAssetStore, LocalMapAssetStore>();
        }
    }

    public static IEndpointRouteBuilder MapNavigationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/navigation");
        group.MapGet("/ping", () => Results.Ok(new { module = "navigation" })).AllowAnonymous();

        CreateMapVersionEndpoint.Map(group);
        UpdateMapVersionEndpoint.Map(group);
        GetMapVersionEndpoint.Map(group);
        GetRouteGraphEndpoint.Map(group);
        GetTrafficGraphValidationEndpoint.Map(group);
        GetTrafficGraphDebugSvgEndpoint.Map(group);
        GetActiveMapVersionEndpoint.Map(group);
        PublishMapVersionEndpoint.Map(group);
        ArchiveMapVersionEndpoint.Map(group);
        ImportMapVersionEndpoint.Map(group);
        CloneMapVersionEndpoint.Map(group);
        CreateEndpointEndpoint.Map(group);
        GetEndpointEndpoint.Map(group);
        UpdateEndpointEndpoint.Map(group);
        DeleteEndpointEndpoint.Map(group);
        CreateEdgeEndpoint.Map(group);
        GetEdgeEndpoint.Map(group);
        UpdateEdgeEndpoint.Map(group);
        DeleteEdgeEndpoint.Map(group);
        CreateZoneEndpoint.Map(group);
        GetZoneEndpoint.Map(group);
        UpdateZoneEndpoint.Map(group);
        DeleteZoneEndpoint.Map(group);

        return endpoints;
    }
}
