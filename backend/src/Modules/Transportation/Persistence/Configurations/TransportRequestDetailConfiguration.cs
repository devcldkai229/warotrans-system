using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Transportation.Entities;

namespace WaroTrans.Transportation.Persistence.Configurations;

public sealed class TransportRequestDetailConfiguration : IEntityTypeConfiguration<TransportRequestDetail>
{
    public void Configure(EntityTypeBuilder<TransportRequestDetail> builder)
    {
        builder.ToTable("transport_request_details");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();

        builder.HasIndex(x => x.TransportRequestId);
        builder.HasIndex(x => new { x.TransportRequestId, x.SequenceNo }).IsUnique();
        builder.HasIndex(x => new { x.TransportRequestId, x.ContainerId }).IsUnique();
        builder.HasIndex(x => x.ContainerId);
        builder.HasIndex(x => x.Status);

        builder.HasOne(x => x.TransportRequest)
            .WithMany(x => x.Details)
            .HasForeignKey(x => x.TransportRequestId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
