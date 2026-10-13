using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity;
using WaroTrans.Identity.Persistence;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Operations.Persistence;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.Host.Extensions;

public static class DatabaseMigrationExtensions
{
    public static async Task ApplyDatabaseMigrationsAsync(this IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseMigrations");
        var environment = sp.GetRequiredService<IHostEnvironment>();

        if (!environment.IsDevelopment())
        {
            logger.LogInformation("Skipping automatic database migrations outside Development.");
            return;
        }

        logger.LogInformation("Applying PostgreSQL migrations...");

        await MigrateAsync<CodeSequenceDbContext>(sp, logger);
        await MigrateAsync<IdentityDbContext>(sp, logger);
        await MigrateAsync<WarehouseDbContext>(sp, logger);
        await MigrateAsync<TransportationDbContext>(sp, logger);
        await MigrateAsync<WorkflowExecutionDbContext>(sp, logger);
        await MigrateAsync<FleetDbContext>(sp, logger);
        await MigrateAsync<NavigationDbContext>(sp, logger);

        logger.LogInformation("Seeding Development accounts...");
        await sp.SeedIdentityDevelopmentDataAsync();

        logger.LogInformation("Ensuring MongoDB indexes...");
        var mongoIndexes = sp.GetRequiredService<OperationsIndexInitializer>();
        await mongoIndexes.EnsureIndexesAsync();

        logger.LogInformation("Database bootstrap completed.");
    }

    private static async Task MigrateAsync<TContext>(IServiceProvider sp, ILogger logger)
        where TContext : DbContext
    {
        var db = sp.GetRequiredService<TContext>();
        logger.LogInformation("Migrating {Context}...", typeof(TContext).Name);
        await db.Database.MigrateAsync();
    }
}
