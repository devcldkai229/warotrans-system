using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence;
using WaroTrans.Transportation.Entities;

namespace WaroTrans.Transportation.Persistence;

public sealed class TransportationDbContext(DbContextOptions<TransportationDbContext> options) : DbContext(options)
{
    public DbSet<StockPosting> StockPostings => Set<StockPosting>();
    public DbSet<TransportSchedule> TransportSchedules => Set<TransportSchedule>();
    public DbSet<TransportWave> TransportWaves => Set<TransportWave>();
    public DbSet<TransportRequest> TransportRequests => Set<TransportRequest>();
    public DbSet<TransportRequestDetail> TransportRequestDetails => Set<TransportRequestDetail>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("transportation");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TransportationDbContext).Assembly);
        modelBuilder.ApplySnakeCaseNamingConvention();
    }
}
