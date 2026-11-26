using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class CargoTransferRecordConfiguration : IEntityTypeConfiguration<CargoTransferRecord>
{
    public void Configure(EntityTypeBuilder<CargoTransferRecord> builder)
    {
        builder.ToTable("cargo_transfer_records");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.FromCustodyType).HasMaxLength(30).IsRequired();
        builder.Property(x => x.ToCustodyType).HasMaxLength(30).IsRequired();
        builder.Property(x => x.IdempotencyKey).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(500);
        builder.HasIndex(x => x.IdempotencyKey).IsUnique();
        builder.HasIndex(x => new { x.JobId, x.ContainerId, x.ConfirmedAt });
        builder.HasIndex(x => x.RecoveryCaseId);
    }
}
