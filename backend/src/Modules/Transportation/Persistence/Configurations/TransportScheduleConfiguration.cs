using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Transportation.Entities;

namespace WaroTrans.Transportation.Persistence.Configurations;

public sealed class TransportScheduleConfiguration : IEntityTypeConfiguration<TransportSchedule>
{
    public void Configure(EntityTypeBuilder<TransportSchedule> builder)
    {
        builder.ToTable("transport_schedules");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Recurrence).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.Timezone).HasMaxLength(100).IsRequired();
        builder.HasIndex(x => x.Status);
    }
}

public sealed class TransportWaveConfiguration : IEntityTypeConfiguration<TransportWave>
{
    public void Configure(EntityTypeBuilder<TransportWave> builder)
    {
        builder.ToTable("transport_waves");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(500);

        // One occurrence is one wave, however many workers look at it.
        builder.HasIndex(x => new { x.TransportScheduleId, x.PlannedAt }).IsUnique();
        builder.HasIndex(x => new { x.Status, x.PlannedAt });

        builder.HasOne(x => x.TransportSchedule)
            .WithMany(x => x.Waves)
            .HasForeignKey(x => x.TransportScheduleId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
