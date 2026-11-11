using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class RobotPositioningIntentConfiguration : IEntityTypeConfiguration<RobotPositioningIntent>
{
    /// <summary>Live = NAVIGATING or YIELDING (PositioningIntentStatus is stored as text).</summary>
    public const string LiveFilter = "status IN ('NAVIGATING', 'YIELDING')";

    public void Configure(EntityTypeBuilder<RobotPositioningIntent> builder)
    {
        builder.ToTable("robot_positioning_intents");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Kind).HasConversion<string>().HasMaxLength(30).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.EndReason).HasMaxLength(200);
        builder.Ignore(x => x.IsLive);

        // The database, not a read-then-write, decides races: one live intent per robot, one robot heading for a parking place.
        builder.HasIndex(x => x.RobotId).IsUnique().HasFilter(LiveFilter).HasDatabaseName("ux_positioning_live_robot");
        builder.HasIndex(x => x.TargetEndpointId).IsUnique().HasFilter(LiveFilter).HasDatabaseName("ux_positioning_live_endpoint");
        builder.HasIndex(x => x.NavigateCommandId);
    }
}
