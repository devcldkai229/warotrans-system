using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Features.ListNotifications;
using WaroTrans.Operations.Features.MarkAllNotificationsRead;
using WaroTrans.Operations.Features.MarkNotificationRead;
using WaroTrans.Operations.Services;
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

        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<ListNotificationsHandler>();
        services.AddScoped<MarkNotificationReadHandler>();
        services.AddScoped<MarkAllNotificationsReadHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapOperationsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/operations");
        group.MapGet("/ping", () => Results.Ok(new { module = "operations" })).AllowAnonymous();
        group.MapListNotifications();
        group.MapMarkNotificationRead();
        group.MapMarkAllNotificationsRead();
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

            // Driver 3.x refuses to write a Guid until it is told how to store it. Standard is the representation
            // other Mongo tools read; the documents here (_id, ReceiverAccountId, related entity ids) are all Guids.
            BsonSerializer.TryRegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));
            _conventionsRegistered = true;
        }
    }
}
