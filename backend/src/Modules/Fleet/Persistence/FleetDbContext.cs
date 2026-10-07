using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence;

public sealed class FleetDbContext(DbContextOptions<FleetDbContext> options) : DbContext(options)
{
    public DbSet<Robot> Robots => Set<Robot>();
    public DbSet<RobotStateEvent> RobotStateEvents => Set<RobotStateEvent>();
    public DbSet<DispatchDecision> DispatchDecisions => Set<DispatchDecision>();
    public DbSet<JobAssignment> JobAssignments => Set<JobAssignment>();
    public DbSet<RobotCommand> RobotCommands => Set<RobotCommand>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("fleet");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FleetDbContext).Assembly);
        modelBuilder.ApplySnakeCaseNamingConvention();
    }
}
