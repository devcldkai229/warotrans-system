using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Persistence;

public sealed class FleetDbContext(DbContextOptions<FleetDbContext> options) : DbContext(options)
{
    public DbSet<Robot> Robots => Set<Robot>();
    public DbSet<RobotStateEvent> RobotStateEvents => Set<RobotStateEvent>();
    public DbSet<DispatchDecision> DispatchDecisions => Set<DispatchDecision>();
    public DbSet<JobAssignment> JobAssignments => Set<JobAssignment>();
    public DbSet<RobotCommand> RobotCommands => Set<RobotCommand>();
    public DbSet<MaintenanceRecord> MaintenanceRecords => Set<MaintenanceRecord>();
    public DbSet<RobotPositioningIntent> RobotPositioningIntents => Set<RobotPositioningIntent>();

    /// <summary>
    /// BOTH-02: a robot's status, connectivity or motion hold changing is history. Heartbeats and telemetry change none of
    /// these on most messages, so nothing is written for them. Paths that use ExecuteUpdate write through
    /// <see cref="RobotStateJournal"/> themselves.
    /// </summary>
    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<Robot>().Where(e => e.State == EntityState.Modified).ToList())
        {
            var status = entry.Property(r => r.Status);
            var online = entry.Property(r => r.IsOnline);
            var held = entry.Property(r => r.MotionHeld);
            var reasons = new List<string>();
            if (status.IsModified && status.OriginalValue != status.CurrentValue) reasons.Add("status");
            if (online.IsModified && online.OriginalValue != online.CurrentValue) reasons.Add(online.CurrentValue ? "online" : "offline");
            if (held.IsModified && held.OriginalValue != held.CurrentValue) reasons.Add(held.CurrentValue ? "motion_held" : "motion_released");
            if (reasons.Count > 0)
            {
                // The robot is about to be saved, so its own current values are the snapshot, not what the database still holds.
                RobotStateEvents.Add(await RobotStateJournal.NewEventAsync(
                    this, entry.Entity.Id, status.OriginalValue, status.CurrentValue, string.Join(",", reasons), RobotStateEventSource.SYSTEM,
                    RobotStateDetails.From(entry.Entity), cancellationToken));
            }
        }

        return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("fleet");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FleetDbContext).Assembly);
        modelBuilder.ApplySnakeCaseNamingConvention();
    }
}
