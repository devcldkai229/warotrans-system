using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations;

public static class OperationsModule
{
    private static readonly object ConventionLock = new();
    private static bool _conventionsRegistered;

    public static IServiceCollection AddOperationsModule(this IServiceCollection services, IConfiguration configuration)
    {
        RegisterCamelCaseConventions();

        var connectionString =
            configuration.GetConnectionString("MongoDB")
            ?? configuration.GetSection(MongoOptions.SectionName)["ConnectionString"]
            ?? throw new InvalidOperationException("ConnectionStrings:MongoDB or Mongo:ConnectionString is required.");

        var databaseName =
            configuration.GetSection(MongoOptions.SectionName)["DatabaseName"]
            ?? "warotrans_operations";

        services.AddSingleton<IMongoClient>(_ => new MongoClient(connectionString));
        services.AddSingleton<IMongoDatabase>(sp =>
            sp.GetRequiredService<IMongoClient>().GetDatabase(databaseName));
        services.AddSingleton<OperationsMongoContext>();
        services.AddSingleton<OperationsIndexInitializer>();

        return services;
    }

    public static IEndpointRouteBuilder MapOperationsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/operations");
        group.MapGet("/ping", () => Results.Ok(new { module = "operations" }));
        return endpoints;
    }

    private static void RegisterCamelCaseConventions()
    {
        lock (ConventionLock)
        {
            if (_conventionsRegistered)
            {
                return;
            }

            var pack = new ConventionPack { new CamelCaseElementNameConvention() };
            ConventionRegistry.Register("WaroTrans.Operations.CamelCase", pack, _ => true);
            _conventionsRegistered = true;
        }
    }
}
