using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

internal sealed class StockHandoverConfiguration : IEntityTypeConfiguration<StockHandover>
{
    public void Configure(EntityTypeBuilder<StockHandover> builder)
    {
        builder.ToTable("stock_handover_outbox");
        builder.HasKey(handover => handover.Id);
        builder.Property(handover => handover.Type).HasConversion<string>().HasMaxLength(20);
        builder.HasIndex(handover => handover.NextAttemptAt);
        builder.HasIndex(handover => handover.TransportRequestId);
        builder.HasIndex(handover => new { handover.JobId, handover.ContainerId, handover.Type }).IsUnique();
    }
}
