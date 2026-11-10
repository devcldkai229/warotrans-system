using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class MaintenanceRecordConfiguration : IEntityTypeConfiguration<MaintenanceRecord>
{
    public void Configure(EntityTypeBuilder<MaintenanceRecord> builder)
    {
        builder.ToTable("maintenance_records");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Reason).HasMaxLength(500).IsRequired();
        builder.Property(x => x.StartedByName).HasMaxLength(255);
        builder.Property(x => x.CompletedByName).HasMaxLength(255);
        builder.Property(x => x.ChecklistJson).HasColumnType("jsonb");
        builder.Property(x => x.Notes).HasMaxLength(2000);
        builder.HasIndex(x => new { x.RobotId, x.StartedAt });
        builder.HasOne<Robot>().WithMany().HasForeignKey(x => x.RobotId).OnDelete(DeleteBehavior.Cascade);
    }
}
