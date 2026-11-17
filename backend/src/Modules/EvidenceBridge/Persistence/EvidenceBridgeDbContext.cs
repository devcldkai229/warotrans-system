using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence;
using WaroTrans.EvidenceBridge.Entities;

namespace WaroTrans.EvidenceBridge.Persistence;

public sealed class EvidenceBridgeDbContext(DbContextOptions<EvidenceBridgeDbContext> options) : DbContext(options)
{
    public const string Schema = "evidence_bridge";

    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(EvidenceBridgeDbContext).Assembly);
        modelBuilder.ApplySnakeCaseNamingConvention();
    }
}
