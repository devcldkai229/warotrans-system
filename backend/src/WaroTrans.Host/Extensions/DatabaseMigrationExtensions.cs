using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.EvidenceBridge.Persistence;
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
    /// <summary>Command-line switch of the one-off migration task: migrate, ensure indexes, exit.</summary>
    public const string MigrateSwitch = "--migrate";

    /// <summary>Development start: migrate, seed the development accounts, ensure indexes.</summary>
    public static async Task ApplyDatabaseMigrationsAsync(this IServiceProvider services)
    {
        var environment = services.GetRequiredService<IHostEnvironment>();
        if (!environment.IsDevelopment())
        {
            services.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseMigrations")
                .LogInformation("Skipping automatic database migrations outside Development.");
            return;
        }

        await services.MigrateDatabasesAsync(seedDevelopmentAccounts: true);
    }

    /// <summary>
    /// Every PostgreSQL migration of the Host's modules and the MongoDB indexes, in any environment. Run once per
    /// deployment by the migration task (<see cref="MigrateSwitch"/>), never by each API task: development accounts
    /// with well-known passwords are seeded only when asked.
    /// </summary>
    public static async Task MigrateDatabasesAsync(this IServiceProvider services, bool seedDevelopmentAccounts)
    {
        await using var scope = services.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseMigrations");

        logger.LogInformation("Applying PostgreSQL migrations...");

        await MigrateAsync<CodeSequenceDbContext>(sp, logger);
        await MigrateAsync<IdentityDbContext>(sp, logger);
        await MigrateAsync<WarehouseDbContext>(sp, logger);
        await MigrateAsync<TransportationDbContext>(sp, logger);
        await MigrateAsync<WorkflowExecutionDbContext>(sp, logger);
        await MigrateAsync<FleetDbContext>(sp, logger);
        await MigrateAsync<NavigationDbContext>(sp, logger);
        await MigrateAsync<EvidenceBridgeDbContext>(sp, logger);

        if (seedDevelopmentAccounts)
        {
            logger.LogInformation("Seeding Development accounts...");
            await sp.SeedIdentityDevelopmentDataAsync();
        }

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
