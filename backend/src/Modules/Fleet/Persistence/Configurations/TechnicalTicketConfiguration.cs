using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class TechnicalTicketConfiguration : IEntityTypeConfiguration<TechnicalTicket>
{
    public void Configure(EntityTypeBuilder<TechnicalTicket> builder)
    {
        builder.ToTable("technical_tickets");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.TicketNo).HasMaxLength(32).IsRequired();
        builder.HasIndex(x => x.TicketNo).IsUnique();
        builder.Property(x => x.RobotCode).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Type).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Status).HasMaxLength(16).IsRequired();
        builder.Property(x => x.Title).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(4000);
        builder.Property(x => x.Findings).HasMaxLength(4000);
        builder.Property(x => x.ActionsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.ChecklistJson).HasColumnType("jsonb");
        builder.Property(x => x.SnapshotJson).HasColumnType("jsonb");
        builder.Property(x => x.Result).HasMaxLength(32);
        builder.Property(x => x.CreatedByName).HasMaxLength(255);
        builder.Property(x => x.CompletedByName).HasMaxLength(255);
        builder.HasIndex(x => new { x.RobotId, x.CreatedAt });
        builder.HasIndex(x => new { x.Status, x.CreatedAt });
        builder.HasOne<Robot>().WithMany().HasForeignKey(x => x.RobotId).OnDelete(DeleteBehavior.Cascade);
    }
}
